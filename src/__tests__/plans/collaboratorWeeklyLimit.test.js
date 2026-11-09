import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Limite semanal do colaborador: 100 mensagens por semana em cada canal.
 * Contam as mensagens ao assistente e as respostas às perguntas; acima do
 * limite o assistente não responde e o aviso sai uma só vez por semana.
 */

const mocks = vi.hoisted(() => ({
  getOrgLimits: vi.fn(),
  getCollaboratorWeeklyUsage: vi.fn(),
  updateOrganizationLocale: vi.fn(),
  requireOwnedOrg: vi.fn(),
}));

/* As perguntas usam a OpenAI; aqui as dependências vêm por `deps`. */
vi.mock("@/lib/services/questions/evaluateOpenQuestion", () => ({
  evaluateOpenQuestion: vi.fn(),
}));
vi.mock("@/lib/services/questions/appendQuestionContext", () => ({
  appendQuestionContext: vi.fn(),
}));
vi.mock("@/lib/repos/messages.repo", () => ({
  createMessage: vi.fn(),
  getMessageByProviderId: vi.fn(),
  getRecentQuestionMessagesForUser: vi.fn(),
}));
vi.mock("@/lib/repos/questions.repo", () => ({
  createQuestionAnswer: vi.fn(),
  updateQuestionAnswerEvaluation: vi.fn(),
  getQuestionAnswer: vi.fn(),
  getQuestionById: vi.fn(),
}));

vi.mock("@/lib/repos/collaboratorWeeklyMessages.repo", () => ({
  claimCollaboratorMessage: vi.fn(),
  getCollaboratorWeeklyUsage: mocks.getCollaboratorWeeklyUsage,
}));

vi.mock("@/lib/services/plans/planLimits", () => ({
  getOrgLimits: mocks.getOrgLimits,
}));

vi.mock("@/lib/repos/organizations.repo", () => ({
  updateOrganizationLocale: mocks.updateOrganizationLocale,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: mocks.requireOwnedOrg,
  parsePositiveInt: (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

import {
  WEEKLY_LIMIT_NOTICE,
  claimCollaboratorWeeklyMessage,
} from "@/lib/services/plans/collaboratorWeeklyLimit";
import { handleQuestionReply } from "@/lib/services/questions/handleQuestionReply";
import { PATCH as saveLocale } from "@/app/api/organizations/locale/route";
import { GET as weeklyUsage } from "@/app/api/plans/collaborator-usage/route";

const ORG = { id: 1, locale: "pt" };
const USER = { id: 42, organization_id: 1, assistant_id: 7 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrgLimits.mockResolvedValue({
    limits: { collaboratorWeeklyMessages: 100 },
  });
  mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1 });
});

describe("claimCollaboratorWeeklyMessage", () => {
  const claimWith = (result) => vi.fn(async () => result);

  it("dentro do limite deixa passar, sem aviso", async () => {
    const claim = claimWith({ ok: true, used: 37, limit: 100, notify: false });

    const result = await claimCollaboratorWeeklyMessage(
      {
        organization: ORG,
        user: USER,
        channel: "whatsapp",
        kind: "assistant",
        sourceId: "m1",
      },
      {
        now: new Date("2026-10-23T10:00:00Z"),
        deps: { claimCollaboratorMessage: claim },
      },
    );

    expect(result).toEqual({ allowed: true, notice: null });
    expect(claim).toHaveBeenCalledWith({
      organizationId: 1,
      userId: 42,
      channel: "whatsapp",
      kind: "assistant",
      sourceId: "m1",
      limit: 100,
      /* Segunda, 19 de outubro, às 00:00 de Lisboa. */
      since: new Date("2026-10-18T23:00:00Z"),
    });
  });

  it("na primeira vez acima do limite traz o aviso, sem números", async () => {
    const result = await claimCollaboratorWeeklyMessage(
      { organization: ORG, user: USER, channel: "teams", kind: "assistant" },
      {
        deps: {
          claimCollaboratorMessage: claimWith({
            ok: false,
            used: 100,
            limit: 100,
            notify: true,
          }),
        },
      },
    );

    expect(result).toEqual({ allowed: false, notice: WEEKLY_LIMIT_NOTICE.pt });
    expect(result.notice).not.toMatch(/\d/);
  });

  it("nas seguintes não traz aviso nenhum", async () => {
    const result = await claimCollaboratorWeeklyMessage(
      { organization: ORG, user: USER, channel: "teams", kind: "assistant" },
      {
        deps: {
          claimCollaboratorMessage: claimWith({
            ok: false,
            used: 100,
            limit: 100,
            notify: false,
          }),
        },
      },
    );

    expect(result).toEqual({ allowed: false, notice: null });
  });

  it("o aviso vai na língua da organização", async () => {
    const result = await claimCollaboratorWeeklyMessage(
      {
        organization: { id: 1, locale: "en" },
        user: USER,
        channel: "teams",
        kind: "assistant",
      },
      {
        deps: {
          claimCollaboratorMessage: claimWith({
            ok: false,
            used: 100,
            limit: 100,
            notify: true,
          }),
        },
      },
    );

    expect(result.notice).toBe(WEEKLY_LIMIT_NOTICE.en);
  });

  it("se a contagem falhar, deixa passar", async () => {
    const claim = vi.fn(async () => {
      throw new Error("base de dados em baixo");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await claimCollaboratorWeeklyMessage(
      { organization: ORG, user: USER, channel: "whatsapp", kind: "assistant" },
      { deps: { claimCollaboratorMessage: claim } },
    );

    expect(result).toEqual({ allowed: true, notice: null });
  });
});

describe("respostas às perguntas acima do limite", () => {
  const NOTICE = WEEKLY_LIMIT_NOTICE.pt;

  function setup(question) {
    const message = {
      id: 20,
      user_id: 42,
      question_id: 10,
      content: question.body,
    };
    const deps = {
      getMessageByProviderId: vi.fn(async () => message),
      getRecentQuestionMessagesForUser: vi.fn(async () => [message]),
      getQuestionById: vi.fn(async () => question),
      getQuestionAnswer: vi.fn(async () => null),
      createQuestionAnswer: vi.fn(async () => ({ id: 30 })),
      createMessage: vi.fn(async () => ({ id: 40 })),
      evaluateOpenQuestion: vi.fn(async () => ({
        verdict: "certa",
        feedback: "Muito bem.",
      })),
      appendQuestionContext: vi.fn(),
      updateQuestionAnswerEvaluation: vi.fn(),
    };
    const sendText = vi.fn(async () => ({ ok: true }));
    return { deps, sendText };
  }

  const OPEN = {
    id: 10,
    organization_id: 1,
    kind: "open",
    body: "Como verificas os pneus?",
    expected_answer: "Com os pneus frios.",
    expires_at: "2099-01-01",
  };

  const QUIZ = {
    id: 10,
    organization_id: 1,
    kind: "quiz",
    body: "Pressão certa?",
    options: [
      { label: "2,2 bar", correct: false },
      { label: "2,8 bar", correct: true },
    ],
    expires_at: "2099-01-01",
  };

  const answer = (question, text, deps, sendText, weekly) =>
    handleQuestionReply({
      user: USER,
      payload: { body: { type: "text", text: { text } } },
      inboundMsgId: "in-1",
      deps,
      sendText,
      resolveThread: vi.fn(async () => ({ threadId: 2, assistant: { id: 7 } })),
      claimWeeklyMessage: vi.fn(async () => weekly),
    });

  it("a resposta aberta fica registada, sem avaliação da IA, e segue o aviso", async () => {
    const { deps, sendText } = setup(OPEN);

    const result = await answer(OPEN, "Com um manómetro", deps, sendText, {
      allowed: false,
      notice: NOTICE,
    });

    expect(deps.createQuestionAnswer).toHaveBeenCalled();
    expect(deps.evaluateOpenQuestion).not.toHaveBeenCalled();
    expect(sendText.mock.calls.map(([text]) => text)).toEqual([
      "Resposta esperada:\nCom os pneus frios.",
      NOTICE,
    ]);
    expect(result.weeklyLimitReached).toBe(true);
  });

  it("o quiz recebe o feedback normal e depois o aviso", async () => {
    const { deps, sendText } = setup(QUIZ);

    await answer(QUIZ, "2,8 bar", deps, sendText, {
      allowed: false,
      notice: NOTICE,
    });

    expect(deps.createQuestionAnswer).toHaveBeenCalled();
    expect(sendText.mock.calls.map(([text]) => text)).toEqual([
      "Certo! ✅",
      NOTICE,
    ]);
  });

  it("depois do primeiro aviso da semana, já não o repete", async () => {
    const { deps, sendText } = setup(QUIZ);

    await answer(QUIZ, "2,8 bar", deps, sendText, {
      allowed: false,
      notice: null,
    });

    expect(sendText.mock.calls.map(([text]) => text)).toEqual(["Certo! ✅"]);
  });

  it("dentro do limite, a pergunta aberta continua a ser avaliada", async () => {
    const { deps, sendText } = setup(OPEN);

    await answer(OPEN, "Com um manómetro", deps, sendText, {
      allowed: true,
      notice: null,
    });

    expect(deps.evaluateOpenQuestion).toHaveBeenCalled();
    expect(sendText.mock.calls.map(([text]) => text)).toEqual([
      "Muito bem.",
      "Resposta esperada:\nCom os pneus frios.",
    ]);
  });

  it("uma resposta repetida não conta", async () => {
    const { deps, sendText } = setup(QUIZ);
    deps.createQuestionAnswer.mockResolvedValue(null);
    const claimWeeklyMessage = vi.fn();

    await handleQuestionReply({
      user: USER,
      payload: { body: { type: "text", text: { text: "2,8 bar" } } },
      deps,
      sendText,
      claimWeeklyMessage,
    });

    expect(claimWeeklyMessage).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/organizations/locale", () => {
  const patch = (body) => saveLocale({ json: async () => body });

  it("guarda a língua escolhida no topo do site", async () => {
    const response = await patch({ orgId: 1, locale: "en" });

    expect(response.status).toBe(200);
    expect(mocks.updateOrganizationLocale).toHaveBeenCalledWith(1, "en");
  });

  it("recusa outras línguas", async () => {
    const response = await patch({ orgId: 1, locale: "fr" });

    expect(response.status).toBe(400);
    expect(mocks.updateOrganizationLocale).not.toHaveBeenCalled();
  });

  it("não mexe na organização de outra pessoa", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await patch({ orgId: 2, locale: "en" });

    expect(response.status).toBe(403);
    expect(mocks.updateOrganizationLocale).not.toHaveBeenCalled();
  });
});

describe("GET /api/plans/collaborator-usage", () => {
  it("devolve o uso da semana de cada colaborador e quando repõe", async () => {
    mocks.getCollaboratorWeeklyUsage.mockResolvedValue({
      42: { whatsapp: 37, teams: 5 },
    });

    const response = await weeklyUsage(
      new Request("http://localhost/api/plans/collaborator-usage?orgId=1"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      limit: 100,
      resetsAt: expect.any(String),
      usage: { 42: { whatsapp: 37, teams: 5 } },
    });
  });
});
