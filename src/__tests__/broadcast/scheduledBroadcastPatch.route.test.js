import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  updateScheduledBroadcast: vi.fn(async (id, patch) => ({
    id,
    channel: "whatsapp",
    ...patch,
  })),
  deleteScheduledBroadcast: vi.fn(),
}));
vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/services/broadcast/scheduledPayload", () => ({
  buildScheduledPayload: vi.fn(async ({ payload }) => ({
    payload: { orgId: 1, message: payload.message, recipients: [] },
    recipientCount: 2,
  })),
}));
vi.mock("@/lib/auth/guards", () => ({
  cleanPatch: (input, allowed) =>
    Object.fromEntries(
      Object.entries(input).filter(([key]) => allowed.includes(key)),
    ),
  handleApiError: (error) => {
    throw error;
  },
  requireOrgForScheduledBroadcast: vi.fn(),
}));

import { updateScheduledBroadcast } from "@/lib/repos/scheduledBroadcasts.repo";
import { requireOrgForScheduledBroadcast } from "@/lib/auth/guards";
import { buildScheduledPayload } from "@/lib/services/broadcast/scheduledPayload";
import { PATCH } from "@/app/api/scheduled-broadcasts/[id]/route";

function auth(overrides = {}) {
  return {
    orgId: 1,
    admin: {},
    user: { id: "admin" },
    broadcastId: "b-1",
    broadcast: { id: "b-1", status: "queued", channel: "whatsapp" },
    ...overrides,
  };
}

function call(body) {
  return PATCH({ json: async () => body }, { params: Promise.resolve({ id: "b-1" }) });
}

describe("PATCH /api/scheduled-broadcasts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgForScheduledBroadcast.mockResolvedValue(auth());
  });

  it("grava o payload validado e o número de destinatários do servidor", async () => {
    const response = await call({
      scheduled_for: "2099-01-01T12:00:00Z",
      payload: { message: "Texto novo", recipients: [{ userId: 1 }] },
      recipient_count: 500,
    });

    expect(response.status).toBe(200);
    expect(buildScheduledPayload).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp" }),
    );
    expect(updateScheduledBroadcast).toHaveBeenCalledWith("b-1", {
      scheduled_for: "2099-01-01T12:00:00Z",
      payload: { orgId: 1, message: "Texto novo", recipients: [] },
      recipient_count: 2,
    });
  });

  it("não deixa o cliente gravar campos fora da lista", async () => {
    await call({
      timezone: "Europe/Lisbon",
      organization_id: 999,
      created_by_user_id: "outro",
    });

    expect(updateScheduledBroadcast).toHaveBeenCalledWith("b-1", {
      timezone: "Europe/Lisbon",
    });
  });

  it("responde 400 e não grava quando o payload não é válido", async () => {
    buildScheduledPayload.mockResolvedValueOnce({ error: "Quiz is missing" });

    const response = await call({ payload: { message: "x" } });

    expect(response.status).toBe(400);
    expect(updateScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("não deixa mudar o canal", async () => {
    const response = await call({ channel: "teams", payload: { message: "x" } });

    expect(response.status).toBe(400);
    expect(updateScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("aceita o canal quando é o mesmo", async () => {
    const response = await call({
      channel: "whatsapp",
      payload: { message: "x" },
    });

    expect(response.status).toBe(200);
  });

  it.each(["processing", "sent", "failed", "cancelled"])(
    "responde 409 quando a mensagem está %s",
    async (status) => {
      requireOrgForScheduledBroadcast.mockResolvedValue(
        auth({ broadcast: { id: "b-1", status, channel: "whatsapp" } }),
      );

      const response = await call({ payload: { message: "x" } });

      expect(response.status).toBe(409);
      expect(updateScheduledBroadcast).not.toHaveBeenCalled();
    },
  );
});
