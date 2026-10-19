import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendWhatsappBroadcast: vi.fn(),
  sendTeamsBroadcast: vi.fn(),
  createMessage: vi.fn(),
  createMessageChainDelivery: vi.fn(),
  markMessageChainDeliveryFailed: vi.fn(),
  updateMessageChainRecipientProgress: vi.fn(),
  getLatestUserThreadForChannel: vi.fn(),
}));

vi.mock("@/lib/services/broadcast/sendWhatsappBroadcast", () => ({
  sendWhatsappBroadcast: (...args) => mocks.sendWhatsappBroadcast(...args),
}));

vi.mock("@/lib/services/broadcast/sendTeamsBroadcast", () => ({
  sendTeamsBroadcast: (...args) => mocks.sendTeamsBroadcast(...args),
}));

vi.mock("@/lib/repos/messages.repo", () => ({
  createMessage: (...args) => mocks.createMessage(...args),
}));

vi.mock("@/lib/repos/threads.repo", () => ({
  getLatestUserThreadForChannel: (...args) =>
    mocks.getLatestUserThreadForChannel(...args),
}));

vi.mock("@/lib/repos/messageChain.repo", () => ({
  createMessageChainDelivery: (...args) =>
    mocks.createMessageChainDelivery(...args),
  markMessageChainDeliveryFailed: (...args) =>
    mocks.markMessageChainDeliveryFailed(...args),
  updateMessageChainRecipientProgress: (...args) =>
    mocks.updateMessageChainRecipientProgress(...args),
}));

import { sendReadChainStep } from "@/lib/services/broadcast/readChains/sendReadChainStep";

const CHAIN = { id: "chain-1", organization_id: 1, created_by_user_id: "u" };
const RECIPIENT = { id: "rec-1", user_id: 42 };

describe("sendReadChainStep with a question step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendWhatsappBroadcast.mockResolvedValue({
      results: [
        {
          ok: true,
          kind: "freeform",
          providerMessageId: "bird-1",
          resolvedMessage: "Pergunta resolvida",
        },
      ],
    });
    mocks.createMessage.mockResolvedValue({ id: 900 });
    mocks.getLatestUserThreadForChannel.mockResolvedValue({
      id: 73,
      assistant_id: 7,
    });
  });

  it("sends the shared question by id and links the message to it and to the thread", async () => {
    const result = await sendReadChainStep({
      chain: CHAIN,
      chainRecipient: RECIPIENT,
      chainStep: {
        id: "step-2",
        payload: { message: "Pergunta", questionId: 4, files: [] },
      },
      stepIndex: 2,
    });

    expect(result.ok).toBe(true);
    expect(mocks.sendWhatsappBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 1,
        questionId: 4,
        recipients: [{ userId: 42 }],
        chainMetadata: expect.objectContaining({
          messageChainId: "chain-1",
          messageChainStepIndex: 2,
        }),
      }),
    );
    expect(mocks.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: 4,
        threadId: 73,
        assistantId: 7,
        messageId: "bird-1",
        content: "Pergunta resolvida",
        messageChainStepIndex: 2,
      }),
    );
  });

  it("sends a plain step without a question id", async () => {
    mocks.getLatestUserThreadForChannel.mockResolvedValue(null);

    await sendReadChainStep({
      chain: CHAIN,
      chainRecipient: RECIPIENT,
      chainStep: { id: "step-1", payload: { message: "Olá", files: [] } },
      stepIndex: 1,
    });

    expect(mocks.sendWhatsappBroadcast.mock.calls[0][0].questionId).toBeNull();
    expect(mocks.createMessage.mock.calls[0][0]).toMatchObject({
      questionId: null,
      threadId: null,
    });
  });

  it("keeps a queued WhatsApp step waiting without recording a failure or delivery", async () => {
    mocks.sendWhatsappBroadcast.mockResolvedValue({
      results: [{ ok: true, kind: "queued", providerMessageId: null }],
    });

    const result = await sendReadChainStep({
      chain: CHAIN,
      chainRecipient: RECIPIENT,
      chainStep: { id: "step-1", payload: { message: "Olá", files: [] } },
      stepIndex: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      sent: false,
      waitingForReply: true,
      kind: "queued",
    });
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.createMessageChainDelivery).not.toHaveBeenCalled();
    expect(mocks.markMessageChainDeliveryFailed).not.toHaveBeenCalled();
    expect(mocks.updateMessageChainRecipientProgress).not.toHaveBeenCalled();
  });
});

describe("sendReadChainStep on Teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendTeamsBroadcast.mockResolvedValue({
      results: [{ ok: true, providerMessageId: "teams-1", messageRowId: 901 }],
    });
  });

  it("sends through Teams with the chain data and links the delivery to the stored message", async () => {
    const result = await sendReadChainStep({
      chain: { ...CHAIN, channel: "teams" },
      chainRecipient: RECIPIENT,
      chainStep: { id: "step-1", payload: { message: "Olá", files: [] } },
      stepIndex: 1,
    });

    expect(result).toMatchObject({ ok: true, sent: true, kind: "teams" });
    expect(mocks.sendWhatsappBroadcast).not.toHaveBeenCalled();
    expect(mocks.sendTeamsBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 1,
        userIds: [42],
        message: "Olá",
        chainMetadata: expect.objectContaining({
          messageChainId: "chain-1",
          messageChainRecipientId: "rec-1",
          messageChainStepIndex: 1,
        }),
      }),
    );
    expect(mocks.createMessageChainDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        messageDbId: 901,
        providerMessageId: "teams-1",
        status: "sent",
      }),
    );
  });

  it("marks the step failed when Teams did not deliver it", async () => {
    mocks.sendTeamsBroadcast.mockResolvedValue({
      results: [{ ok: false, error: "No Teams installation found." }],
    });

    const result = await sendReadChainStep({
      chain: { ...CHAIN, channel: "teams" },
      chainRecipient: RECIPIENT,
      chainStep: { id: "step-1", payload: { message: "Olá" } },
      stepIndex: 1,
    });

    expect(result).toMatchObject({ ok: false, sent: false });
    expect(mocks.markMessageChainDeliveryFailed).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "No Teams installation found." }),
    );
  });
});
