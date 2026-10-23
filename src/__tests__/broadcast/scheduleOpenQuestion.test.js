import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  createScheduledBroadcast: vi.fn(async (row) => ({
    id: "schedule-1",
    ...row,
  })),
  countManualQueuedBroadcasts: vi.fn(async () => 0),
}));
/* O limite de agendadas tem testes próprios (automationScheduledLimits); aqui, sem limite. */
vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => ({
  ...(await importOriginal()),
  getOrgLimits: vi.fn(async () => ({
    plan: { id: 4, name: "Enterprise", level: 4 },
    limits: { scheduledMessages: null },
  })),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: vi.fn(async () => ({
    orgId: 1,
    user: { id: "admin" },
    admin: {},
  })),
  requireAllRecipientsToBeKnownUsers: vi.fn(() => [5700]),
  assertUsersBelongToOrg: vi.fn(),
  handleApiError: (error) => {
    throw error;
  },
}));
import { createScheduledBroadcast } from "@/lib/repos/scheduledBroadcasts.repo";
import { POST } from "@/app/api/broadcast/schedule/route";

describe("agendar pergunta aberta", () => {
  beforeEach(() => vi.clearAllMocks());
  const request = (question) => ({
    json: async () => ({
      orgId: 1,
      channel: "whatsapp",
      scheduledFor: "2099-01-01T12:00:00Z",
      payload: { recipients: [{ userId: 5700 }], question },
    }),
  });
  it("guarda a pergunta normalizada e a avaliação para o envio agendado", async () => {
    const response = await POST(
      request({
        kind: "open",
        body: " Pergunta ",
        expectedAnswer: " Esperada ",
      }),
    );
    expect(response.status).toBe(200);
    expect(createScheduledBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          question: {
            kind: "open",
            body: "Pergunta",
            expectedAnswer: "Esperada",
            aiEvaluation: true,
          },
        }),
      }),
    );
  });
  it("rejeita o agendamento sem resposta esperada", async () => {
    const response = await POST(request({ kind: "open", body: "Pergunta" }));
    expect(response.status).toBe(400);
    expect(createScheduledBroadcast).not.toHaveBeenCalled();
  });
});
