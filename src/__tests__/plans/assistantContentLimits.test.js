import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #185: instruções até 5.000 caracteres e 5 ficheiros por assistente.
 * O que já estava acima do limite (criado antes dele) pode ficar como está ou
 * diminuir, mas não crescer (leitura ii).
 */

const mocks = vi.hoisted(() => ({
  getOrgLimits: vi.fn(),
  requireOwnedOrg: vi.fn(),
  requireOrgForAssistant: vi.fn(),
  countAssistantsByOrg: vi.fn(),
  createAssistant: vi.fn(),
  updateAssistant: vi.fn(),
  getStoreById: vi.fn(),
  uploadOpenAiFilesFromStorage: vi.fn(),
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
  countAssistantsByOrg: mocks.countAssistantsByOrg,
  createAssistant: mocks.createAssistant,
  updateAssistant: mocks.updateAssistant,
  getAssistantsInOrg: vi.fn(),
  deleteAssistant: vi.fn(),
  associateVectorStoreToDbAssistant: vi.fn(),
  nullifyVectorStoreToDbAssistant: vi.fn(),
}));

vi.mock("@/lib/repos/store.repo", () => ({
  getStoreById: mocks.getStoreById,
  updateStoreName: vi.fn(),
  deleteStoreById: vi.fn(),
  createDBStore: vi.fn(),
}));

vi.mock("@/lib/repos/files.repo", () => ({
  createDBFiles: vi.fn(),
  deleteFileById: vi.fn(),
}));

vi.mock("@/lib/services/openaiFiles.service", () => ({
  uploadOpenAiFilesFromStorage: mocks.uploadOpenAiFilesFromStorage,
  createOpenAiVectorStore: vi.fn(),
  attachOpenAiFileToVectorStore: vi.fn(),
  detachOpenAiFileFromVectorStore: vi.fn(),
  deleteOpenAiFile: vi.fn(),
  updateOpenAiVectorStore: vi.fn(),
  deleteOpenAiVectorStoreAndFiles: vi.fn(),
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

import { limitKeepingCurrent } from "@/lib/services/plans/planLimits";
import { POST as createAssistant } from "@/app/api/assistants/route";
import { PATCH as editAssistant } from "@/app/api/assistants/[assistantId]/route";
import { POST as createStore } from "@/app/api/assistants/[assistantId]/vector-store/route";
import { PATCH as editStore } from "@/app/api/assistants/[assistantId]/vector-store/[storeId]/route";

const DEMO = {
  plan: { id: 1, name: "Demo", level: 0 },
  limits: { assistants: 20, assistantInstructionChars: 5000, filesPerAssistant: 5 },
};

const json = (body) => ({ json: () => Promise.resolve(body) });
const text = (n) => "a".repeat(n);
const files = (n) =>
  Array.from({ length: n }, (_, i) => ({ bucket: "b", path: `p${i}`, name: `f${i}.pdf` }));
const storeWith = (n) => ({
  id: 11,
  store_name: "Docs",
  open_ai_id: "vs_1",
  file: Array.from({ length: n }, (_, i) => ({ id: i + 1, open_ai_id: `file_${i}` })),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrgLimits.mockResolvedValue(DEMO);
  mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, admin: {} });
  mocks.countAssistantsByOrg.mockResolvedValue(0);
  mocks.createAssistant.mockResolvedValue({ id: 5, name: "Novo" });
  mocks.updateAssistant.mockResolvedValue({ id: 73, name: "Pixel & Prompt" });
  /* O upload é a última coisa que interessa: chegar lá quer dizer que passou. */
  mocks.uploadOpenAiFilesFromStorage.mockRejectedValue(new Error("passou o limite"));
});

describe("limitKeepingCurrent", () => {
  it.each([
    [5000, 0, 5000, "ao criar vale o limite do plano"],
    [5000, 3000, 5000, "abaixo do limite, vale o limite"],
    [5000, 7405, 7405, "acima do limite, fica com o que já tinha"],
    [null, 9999, null, "sem limite no plano"],
  ])("limite %s, tem %s → %s (%s)", (limit, current, expected) => {
    expect(limitKeepingCurrent(limit, current)).toBe(expected);
  });
});

describe("instruções ao criar um assistente", () => {
  const create = (instructions) =>
    createAssistant(json({ organizationId: 1, name: "Novo", model: "m", instructions }));

  it("aceita 5.000 caracteres", async () => {
    const response = await create(text(5000));
    expect(response.status).not.toBe(400);
    expect(mocks.createAssistant).toHaveBeenCalled();
  });

  it("recusa 5.001 com o código e o máximo, e não cria", async () => {
    const response = await create(text(5001));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INSTRUCTIONS_TOO_LONG",
      plan: "Demo",
      limit: 5000,
    });
    expect(mocks.createAssistant).not.toHaveBeenCalled();
  });
});

describe("instruções ao editar um assistente", () => {
  function assistantWith(length) {
    mocks.requireOrgForAssistant.mockResolvedValue({
      orgId: 1,
      assistantId: 73,
      assistant: { id: 73, name: "Pixel & Prompt", instructions: text(length) },
    });
  }

  const edit = (patch) =>
    editAssistant(json(patch), { params: Promise.resolve({ assistantId: "73" }) });

  it("um assistente normal não passa dos 5.000", async () => {
    assistantWith(3000);

    const response = await edit({ instructions: text(5001) });

    expect(response.status).toBe(400);
    expect((await response.json()).limit).toBe(5000);
    expect(mocks.updateAssistant).not.toHaveBeenCalled();
  });

  it("o Pixel & Prompt (7.405) pode guardar até 7.405", async () => {
    assistantWith(7405);

    const response = await edit({ instructions: text(7405) });

    expect(response.status).toBe(200);
    expect(mocks.updateAssistant).toHaveBeenCalled();
  });

  it("o Pixel & Prompt não pode crescer acima de 7.405", async () => {
    assistantWith(7405);

    const response = await edit({ instructions: text(7406) });

    expect(response.status).toBe(400);
    expect((await response.json()).limit).toBe(7405);
  });

  it("mudar só o nome não verifica as instruções", async () => {
    assistantWith(7405);

    const response = await edit({ name: "Pixel" });

    expect(response.status).toBe(200);
    expect(mocks.getOrgLimits).not.toHaveBeenCalled();
  });
});

describe("ficheiros por assistente", () => {
  beforeEach(() => {
    mocks.requireOrgForAssistant.mockResolvedValue({
      orgId: 1,
      assistantId: 7,
      assistant: { id: 7, vector_store_id: 11 },
    });
  });

  const params = { params: Promise.resolve({ assistantId: "7", storeId: "11" }) };
  const create = (n) =>
    createStore(json({ storeName: "Docs", files: files(n) }), params);
  const edit = (existing, body) => {
    mocks.getStoreById.mockResolvedValue(storeWith(existing));
    return editStore(json({ storeName: "Docs", ...body }), params);
  };

  async function expectRefused(responsePromise, limit) {
    const response = await responsePromise;
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "ASSISTANT_FILE_LIMIT_REACHED",
      limit,
    });
    expect(mocks.uploadOpenAiFilesFromStorage).not.toHaveBeenCalled();
  }

  async function expectAllowed(responsePromise) {
    await responsePromise.catch(() => {});
    expect(mocks.uploadOpenAiFilesFromStorage).toHaveBeenCalled();
  }

  it("criar a coleção com 5 passa", async () => {
    await expectAllowed(create(5));
  });

  it("criar a coleção com 6 é recusado antes de enviar para a OpenAI", async () => {
    await expectRefused(create(6), 5);
  });

  it("com 3, juntar 3 é recusado", async () => {
    await expectRefused(edit(3, { files: files(3) }), 5);
  });

  it("com 5, trocar 1 por 1 passa", async () => {
    await expectAllowed(edit(5, { files: files(1), removedFileIds: [1] }));
  });

  it("uma coleção antiga com 8 pode mudar o nome", async () => {
    await expectAllowed(edit(8, { storeName: "Novo nome" }));
  });

  it("uma coleção antiga com 8 pode trocar ficheiros, mas não crescer", async () => {
    await expectAllowed(edit(8, { files: files(1), removedFileIds: [1] }));
    vi.clearAllMocks();
    mocks.getOrgLimits.mockResolvedValue(DEMO);
    await expectRefused(edit(8, { files: files(1) }), 8);
  });
});
