import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({
  throwHttpError: (message, status = 400) => {
    const error = new Error(message);
    error.status = status;
    throw error;
  },
  requireAllRecipientsToBeKnownUsers: vi.fn((recipients) =>
    recipients.map((recipient) => Number(recipient.userId)),
  ),
  assertUsersBelongToOrg: vi.fn(async () => undefined),
  assertTeamsGroupsBelongToOrg: vi.fn(async (_admin, _orgId, ids) =>
    ids.map((id) => ({ id, name: `Grupo ${id}` })),
  ),
}));

import {
  assertTeamsGroupsBelongToOrg,
  assertUsersBelongToOrg,
} from "@/lib/auth/guards";
import { buildScheduledPayload } from "@/lib/services/broadcast/scheduledPayload";

const orgAuth = { orgId: 7, admin: {} };

describe("buildScheduledPayload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("WhatsApp: guarda só o userId e recalcula o número de destinatários", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "whatsapp",
      payload: {
        message: "Olá",
        recipients: [
          { userId: 5700, name: "Ana", phoneNumber: "+351910000000" },
          { userId: 5701 },
        ],
        recipient_count: 99,
        organization_id: 1234,
      },
    });

    expect(result.recipientCount).toBe(2);
    expect(result.payload.recipients).toEqual([
      { userId: 5700 },
      { userId: 5701 },
    ]);
    expect(result.payload.orgId).toBe(7);
    expect(result.payload).not.toHaveProperty("organization_id");
    expect(result.payload).not.toHaveProperty("recipient_count");
    expect(assertUsersBelongToOrg).toHaveBeenCalledWith({}, 7, [5700, 5701]);
  });

  it("Teams: usa userIds e ignora recipients em bruto", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "teams",
      payload: {
        message: "Olá",
        userIds: [3, 4, 5],
        recipients: [{ userId: 999 }],
      },
    });

    expect(result.recipientCount).toBe(3);
    expect(result.payload.userIds).toEqual([3, 4, 5]);
    expect(result.payload).not.toHaveProperty("recipients");
  });

  it("mantém a pergunta normalizada e a mensagem vazia", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "whatsapp",
      payload: {
        message: "",
        recipients: [{ userId: 1 }],
        question: {
          kind: "open",
          body: " Pergunta ",
          expectedAnswer: " Esperada ",
        },
      },
    });

    expect(result.payload.message).toBe("");
    expect(result.payload.question).toEqual({
      kind: "open",
      body: "Pergunta",
      expectedAnswer: "Esperada",
      aiEvaluation: true,
    });
  });

  it("devolve erro quando a pergunta não é válida", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "whatsapp",
      payload: {
        recipients: [{ userId: 1 }],
        question: { kind: "open", body: "Sem resposta esperada" },
      },
    });

    expect(result.error).toBeTruthy();
    expect(result.payload).toBeUndefined();
  });

  it("devolve erro quando a abertura não é válida", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "whatsapp",
      payload: { recipients: [{ userId: 1 }], openingBody: 42 },
    });

    expect(result.error).toBe("openingBody must be a string");
  });

  it("grupos do Teams: relê os grupos da organização e não leva links", async () => {
    const result = await buildScheduledPayload({
      orgAuth,
      channel: "teams",
      payload: {
        message: "Olá grupos",
        groupIds: [11, "12", 11],
        groups: [{ id: 99, name: "Inventado pelo cliente" }],
      },
    });

    expect(assertTeamsGroupsBelongToOrg).toHaveBeenCalledWith({}, 7, [11, 12]);
    expect(result.recipientCount).toBe(2);
    expect(result.payload.groups).toEqual([
      { id: 11, name: "Grupo 11" },
      { id: 12, name: "Grupo 12" },
    ]);
    expect(result.payload.trackedLinks).toEqual([]);
  });

  it("grupos do Teams: rejeita pergunta", async () => {
    await expect(
      buildScheduledPayload({
        orgAuth,
        channel: "teams",
        payload: {
          groupIds: [11],
          question: { kind: "open", body: "x", expectedAnswer: "y" },
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
