import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  assertUsersBelongToOrg: vi.fn(),
  sendTeamsBroadcast: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: mocks.requireOwnedOrg,
  assertUsersBelongToOrg: mocks.assertUsersBelongToOrg,
  jsonError(message, status) {
    return Response.json({ error: message }, { status });
  },
}));

vi.mock("@/lib/services/broadcast/sendTeamsBroadcast", () => ({
  sendTeamsBroadcast: mocks.sendTeamsBroadcast,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

/* O limite do conteúdo tem testes próprios (composerLimits); aqui, dentro do plano. */
vi.mock("@/lib/services/plans/planLimits", () => ({
  checkMessageContent: vi.fn(async () => ({ orgLimits: { limits: {} } })),
}));

import { POST } from "@/app/api/broadcast/teams/route";

const request = (body) => ({ json: async () => body });

describe("POST /api/broadcast/teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7, admin: {} });
    mocks.sendTeamsBroadcast.mockResolvedValue({ ok: 2, failed: 0 });
  });

  it("sends to the userIds the composer posts", async () => {
    const response = await POST(
      request({ orgId: 7, userIds: [3, "5"], message: "Olá" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.assertUsersBelongToOrg).toHaveBeenCalledWith({}, 7, [3, 5]);
    expect(mocks.sendTeamsBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 7, userIds: [3, 5], message: "Olá" }),
    );
  });

  it("still accepts recipients objects", async () => {
    await POST(request({ orgId: 7, recipients: [{ userId: 4 }], message: "x" }));

    expect(mocks.sendTeamsBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: [4] }),
    );
  });

  it("rejects a send without valid recipients", async () => {
    const response = await POST(request({ orgId: 7, userIds: [], message: "x" }));

    expect(response.status).toBe(400);
    expect(mocks.sendTeamsBroadcast).not.toHaveBeenCalled();
  });
});
