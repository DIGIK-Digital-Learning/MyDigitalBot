import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #250: todos os assistentes seguem o modelo da app (6 Luna), definido num
 * sítio só (src/lib/openai/models.js), sem temperature nem top_p.
 */

const mocks = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
  requireOwnedOrg: vi.fn(),
  requireOrgForAssistant: vi.fn(),
  createAssistant: vi.fn(),
  updateAssistant: vi.fn(),
  getOrgLimits: vi.fn(),
}));

vi.mock("@/lib/openai/client", () => ({
  openai: { responses: { create: mocks.responsesCreate } },
}));

vi.mock("@/lib/db/readAccess", () => ({
  withSessionReadAccess: (_auth, fn) => fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  parsePositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
  requireOwnedOrg: mocks.requireOwnedOrg,
  requireOrgForAssistant: mocks.requireOrgForAssistant,
  cleanPatch(updates, allowed) {
    return Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowed.includes(key)),
    );
  },
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => ({
  ...(await importOriginal()),
  getOrgLimits: mocks.getOrgLimits,
}));

vi.mock("@/lib/repos/assistants.repo", () => ({
  countAssistantsByOrg: vi.fn(async () => 0),
  createAssistant: mocks.createAssistant,
  updateAssistant: mocks.updateAssistant,
  getAssistantsInOrg: vi.fn(),
  deleteAssistant: vi.fn(),
}));

vi.mock("@/lib/repos/store.repo", () => ({ getStoreById: vi.fn() }));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

import { AI_MODELS, textModelRequest } from "@/lib/openai/models";
import { generateAssistantResponse } from "@/lib/services/openaiResponses.service";
import { suggestMessageText } from "@/lib/services/broadcast/suggestMessageText";
import { POST as createAssistantRoute } from "@/app/api/assistants/route";
import { PATCH as editAssistantRoute } from "@/app/api/assistants/[assistantId]/route";

const json = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.responsesCreate.mockResolvedValue({ id: "r1", output_text: "ok" });
  mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, admin: {} });
  mocks.getOrgLimits.mockResolvedValue({
    plan: { id: 3, name: "Starter", level: 2 },
    limits: { assistants: 20, assistantInstructionChars: 5000 },
  });
  mocks.createAssistant.mockImplementation(async (row) => ({ id: 5, ...row }));
  mocks.requireOrgForAssistant.mockResolvedValue({
    orgId: 1,
    assistantId: 73,
    assistant: { id: 73, name: "Velho", instructions: "" },
  });
  mocks.updateAssistant.mockImplementation(async (_id, patch) => ({
    id: 73,
    ...patch,
  }));
});

describe("o modelo está num sítio só", () => {
  it("é o 6 Luna, com respostas rápidas e sem temperatura", () => {
    expect(AI_MODELS.text).toBe("gpt-6-luna");
    expect(textModelRequest()).toEqual({
      model: "gpt-6-luna",
      reasoning: { effort: "none" },
    });
  });

  it("nenhum ficheiro da app tem o nome de um modelo escrito fora de models.js", () => {
    const root = join(process.cwd(), "src");
    const modelName =
      /["'`](gpt-[\w.-]+|o\d(?:-[\w-]+)?|dall-e[\w-]*|text-embedding-[\w-]+|whisper-[\w-]+|tts-[\w-]+)["'`]/;
    const offenders = [];

    (function walk(dir) {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "__tests__") walk(path);
          continue;
        }
        if (!/\.(m?js|jsx)$/.test(entry)) continue;
        if (path.endsWith(join("lib", "openai", "models.js"))) continue;

        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, index) => {
            const match = line.match(modelName);
            if (match) {
              offenders.push(
                `${relative(root, path)}:${index + 1} ${match[1]}`,
              );
            }
          });
      }
    })(root);

    expect(offenders).toEqual([]);
  });
});

describe("respostas dos assistentes", () => {
  it("usam o modelo da app, mesmo que o assistente tenha outro guardado", async () => {
    await generateAssistantResponse({
      assistant: {
        id: 3,
        model: "gpt-5.6-luna",
        temperature: 0.7,
        top_p: 0.2,
        instructions: "Sê simpático.",
      },
      conversationId: "c1",
      message: "Olá",
    });

    const request = mocks.responsesCreate.mock.calls[0][0];
    expect(request.model).toBe(AI_MODELS.text);
    expect(request.reasoning).toEqual({ effort: "none" });
    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("top_p");
  });

  it("funcionam num assistente sem modelo guardado", async () => {
    await expect(
      generateAssistantResponse({
        assistant: { id: 3, instructions: "" },
        conversationId: "c1",
        message: "Olá",
      }),
    ).resolves.toMatchObject({ aiResponse: "ok" });
  });
});

describe("sugestões de texto", () => {
  it("usam o modelo da app", async () => {
    const create = vi.fn(async () => ({
      status: "completed",
      output_text: JSON.stringify({ text: "Texto sugerido" }),
    }));

    await suggestMessageText({
      prompt: "Dica sobre segurança",
      deps: { openai: { responses: { create } } },
    });

    expect(create.mock.calls[0][0]).toMatchObject(textModelRequest());
  });
});

describe("criar e editar um assistente", () => {
  it("ao criar, grava o modelo da app e ignora modelo e temperatura do pedido", async () => {
    const response = await createAssistantRoute(
      json({
        organizationId: 1,
        name: "Novo",
        instructions: "",
        model: "gpt-4.1",
        temperature: 1.1,
        top_p: 0.5,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createAssistant).toHaveBeenCalledWith(
      expect.objectContaining({
        model: AI_MODELS.text,
        temperature: null,
        top_p: null,
      }),
    );
  });

  it("cria sem modelo no pedido (a janela já não o manda)", async () => {
    const response = await createAssistantRoute(
      json({ organizationId: 1, name: "Novo", instructions: "" }),
    );

    expect(response.status).toBe(201);
  });

  it("ao editar, o modelo e a temperatura não passam", async () => {
    const response = await editAssistantRoute(
      json({ name: "Novo nome", model: "gpt-4.1", temperature: 2, top_p: 0.1 }),
      { params: Promise.resolve({ assistantId: "73" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateAssistant).toHaveBeenCalledWith(73, {
      name: "Novo nome",
    });
  });
});
