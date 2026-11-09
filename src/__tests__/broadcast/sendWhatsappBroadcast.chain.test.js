import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Envio de uma pergunta já criada (passo de uma cadeia de leitura): usa a
 * linha existente em vez de criar outra, e deixa o registo da mensagem para
 * o passo da cadeia.
 */
const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  isWindowOpenForUser: vi.fn(),
  createPendingOutreach: vi.fn(),
  getAllPendingOutreachByUser: vi.fn(),
  updatePendingOutreachTemplateMessageId: vi.fn(),
  deletePendingOutreach: vi.fn(),
  claimWhatsappOpeningGate: vi.fn(),
  getWhatsappOpeningGate: vi.fn(),
  attachWhatsappOpeningGateOutreach: vi.fn(),
  markWhatsappOpeningGateSent: vi.fn(),
  failWhatsappOpeningGate: vi.fn(),
  createMessage: vi.fn(),
  createQuestion: vi.fn(),
  getQuestionById: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 1,
              name: "DIGIK",
              channel_id: "channel-1",
              default_phone_country_code: "+351",
              whatsapp_opening_body: null,
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/repos/user.repo", () => ({
  getUserById: (...args) => mocks.getUserById(...args),
}));

vi.mock("@/lib/repos/messages.repo", () => ({
  isWindowOpenForUser: (...args) => mocks.isWindowOpenForUser(...args),
  createMessage: (...args) => mocks.createMessage(...args),
}));

vi.mock("@/lib/repos/pendingOutreach.repo", () => ({
  createPendingOutreach: (...args) => mocks.createPendingOutreach(...args),
  deletePendingOutreach: (...args) => mocks.deletePendingOutreach(...args),
  getAllPendingOutreachByUser: (...args) =>
    mocks.getAllPendingOutreachByUser(...args),
  updatePendingOutreachTemplateMessageId: (...args) =>
    mocks.updatePendingOutreachTemplateMessageId(...args),
}));

vi.mock("@/lib/repos/whatsappOpeningGate.repo", () => ({
  attachWhatsappOpeningGateOutreach: (...args) =>
    mocks.attachWhatsappOpeningGateOutreach(...args),
  claimWhatsappOpeningGate: (...args) =>
    mocks.claimWhatsappOpeningGate(...args),
  failWhatsappOpeningGate: (...args) =>
    mocks.failWhatsappOpeningGate(...args),
  getWhatsappOpeningGate: (...args) => mocks.getWhatsappOpeningGate(...args),
  markWhatsappOpeningGateSent: (...args) =>
    mocks.markWhatsappOpeningGateSent(...args),
}));

vi.mock("@/lib/repos/questions.repo", () => ({
  createQuestion: (...args) => mocks.createQuestion(...args),
  getQuestionById: (...args) => mocks.getQuestionById(...args),
}));

vi.mock("@/lib/repos/threads.repo", () => ({
  getLatestUserThreadForChannel: async () => null,
}));

vi.mock("@/lib/services/broadcast/trackedLinks", () => ({
  resolveTrackedLinksForRecipient: async () => [],
  replaceTrackedPlaceholders: (text) => text,
  replaceTrackedLinksInText: (text) => text,
}));

vi.mock("@/lib/whatsapp/E164", () => ({
  toE164: async (value) => value,
}));

import { sendWhatsappBroadcast } from "@/lib/services/broadcast/sendWhatsappBroadcast";

const QUESTION_ROW = {
  id: 10,
  organization_id: 1,
  kind: "quiz",
  body: "Olá {{nome}}, qual é a pressão certa?",
  options: [
    { label: "2,2 bar", correct: false },
    { label: "2,8 bar", correct: true },
  ],
  expected_answer: null,
  ai_evaluation: true,
};

const CHAIN = {
  messageChainId: "chain-1",
  messageChainStepId: "step-1",
  messageChainRecipientId: "recipient-1",
  messageChainStepIndex: 2,
};

describe("sendWhatsappBroadcast with an existing question", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserById.mockResolvedValue({
      id: 42,
      organization_id: 1,
      name: "Pedro",
      phone_number: "+351910000000",
    });
    mocks.isWindowOpenForUser.mockResolvedValue(true);
    mocks.getAllPendingOutreachByUser.mockResolvedValue([]);
    mocks.getWhatsappOpeningGate.mockResolvedValue(null);
    mocks.claimWhatsappOpeningGate.mockImplementation(({ expiresAt }) => ({
      claimed: true,
      gate: {
        status: "sending",
        expires_at:
          expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      },
    }));
    mocks.attachWhatsappOpeningGateOutreach.mockResolvedValue(undefined);
    mocks.markWhatsappOpeningGateSent.mockResolvedValue(undefined);
    mocks.updatePendingOutreachTemplateMessageId.mockResolvedValue(undefined);
    mocks.deletePendingOutreach.mockResolvedValue(undefined);
    mocks.failWhatsappOpeningGate.mockResolvedValue(undefined);
    mocks.getQuestionById.mockResolvedValue(QUESTION_ROW);
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "bird-msg-1" }),
    });

    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("WORKSPACE_ID", "ws-1");
    vi.stubEnv("BIRD_API_KEY", "key-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the stored question with its buttons and creates no new question", async () => {
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      recipients: [{ userId: 42 }],
      questionId: 10,
      chainMetadata: CHAIN,
    });

    expect(result.ok).toBe(1);
    expect(result.questionId).toBe(10);
    expect(mocks.getQuestionById).toHaveBeenCalledWith(10);
    expect(mocks.createQuestion).not.toHaveBeenCalled();

    const [, init] = mocks.fetch.mock.calls[0];
    expect(JSON.parse(init.body).body).toEqual({
      type: "text",
      text: {
        text: "Olá Pedro, qual é a pressão certa?",
        actions: [
          { type: "reply", reply: { text: "2,2 bar" } },
          { type: "reply", reply: { text: "2,8 bar" } },
        ],
      },
    });

    /* Numa cadeia é o passo que regista a mensagem, com os dados da cadeia. */
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("still records the message itself outside a chain", async () => {
    await sendWhatsappBroadcast({
      orgId: 1,
      recipients: [{ userId: 42 }],
      questionId: 10,
    });

    expect(mocks.createMessage).toHaveBeenCalledTimes(1);
    expect(mocks.createMessage.mock.calls[0][0]).toMatchObject({
      questionId: 10,
      messageId: "bird-msg-1",
    });
  });

  it("queues the stored question behind the opening template when the window is closed", async () => {
    mocks.isWindowOpenForUser.mockResolvedValue(false);
    mocks.createPendingOutreach.mockResolvedValue({ id: "po-1" });
    vi.stubEnv("BIRD_OPENING_TEMPLATE_PROJECT_ID", "project-opening");

    const result = await sendWhatsappBroadcast({
      orgId: 1,
      recipients: [{ userId: 42 }],
      questionId: 10,
      chainMetadata: CHAIN,
    });

    expect(result.queued).toBe(1);
    expect(mocks.createPendingOutreach.mock.calls[0][0]).toMatchObject({
      payload: { type: "quiz", questionId: 10 },
      messageChainId: "chain-1",
      messageChainStepIndex: 2,
    });
  });

  it("rejects a question from another organization", async () => {
    mocks.getQuestionById.mockResolvedValue({
      ...QUESTION_ROW,
      organization_id: 2,
    });

    await expect(
      sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        questionId: 10,
      }),
    ).rejects.toThrow(/Question not found/);
  });
});
