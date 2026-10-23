import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #188: 10 envios por dia em cada canal, para a conta toda. Um envio conta 1
 * (seja para quantos colaboradores for), uma corrente conta 1 por mensagem e
 * uma agendada conta no dia em que é agendada.
 */

const mocks = vi.hoisted(() => ({
  getOrganizationPlan: vi.fn(),
  claimAdminDailySend: vi.fn(),
  releaseAdminDailySend: vi.fn(),
  setAdminDailySendSource: vi.fn(),
  refundScheduledSend: vi.fn(),
  sendWhatsappBroadcast: vi.fn(),
  sendTeamsGroupBroadcast: vi.fn(),
  createMessageChain: vi.fn(),
  createScheduledBroadcast: vi.fn(),
  updateScheduledBroadcast: vi.fn(),
  deleteScheduledBroadcast: vi.fn(),
}));

vi.mock("@/lib/repos/plans.repo", () => ({
  getOrganizationPlan: mocks.getOrganizationPlan,
}));

vi.mock("@/lib/repos/adminDailySends.repo", () => ({
  claimAdminDailySend: mocks.claimAdminDailySend,
  releaseAdminDailySend: mocks.releaseAdminDailySend,
  setAdminDailySendSource: mocks.setAdminDailySendSource,
  refundScheduledSend: mocks.refundScheduledSend,
  countAdminDailySends: vi.fn(async () => ({ whatsapp: 0, teams: 0 })),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: vi.fn(async () => ({
    orgId: 1,
    admin: {},
    user: { id: "u" },
  })),
  requireOrgForScheduledBroadcast: vi.fn(async (id) => ({
    orgId: 1,
    broadcastId: id,
    broadcast: { id, status: "queued", channel: "teams" },
  })),
  cleanPatch: (body, fields) =>
    Object.fromEntries(
      Object.entries(body).filter(([key]) => fields.includes(key)),
    ),
  assertUsersBelongToOrg: vi.fn(),
  assertTeamsGroupsBelongToOrg: vi.fn(async () => [{ id: 3 }]),
  requireAllRecipientsToBeKnownUsers: vi.fn(() => [5, 6, 7]),
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

vi.mock("@/lib/services/broadcast/sendWhatsappBroadcast", () => ({
  sendWhatsappBroadcast: mocks.sendWhatsappBroadcast,
}));

vi.mock("@/lib/services/broadcast/sendTeamsGroupBroadcast", () => ({
  sendTeamsGroupBroadcast: mocks.sendTeamsGroupBroadcast,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/organizationMessagingFeature.repo", () => ({
  isReadChainsEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/repos/messageChain.repo", () => ({
  createMessageChain: mocks.createMessageChain,
  createMessageChainRecipients: vi.fn(async () => []),
  createMessageChainSteps: vi.fn(async () => []),
}));

vi.mock("@/lib/services/broadcast/readChains/sendReadChainStep", () => ({
  sendReadChainStep: vi.fn(),
}));

vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  countManualQueuedBroadcasts: vi.fn(async () => 0),
  createScheduledBroadcast: mocks.createScheduledBroadcast,
  updateScheduledBroadcast: mocks.updateScheduledBroadcast,
  deleteScheduledBroadcast: mocks.deleteScheduledBroadcast,
}));

vi.mock("@/lib/services/broadcast/scheduledPayload", () => ({
  buildScheduledPayload: vi.fn(async () => ({
    payload: { userIds: [5] },
    recipientCount: 1,
  })),
}));

import { claimDailySend } from "@/lib/services/plans/planLimits";
import { POST as sendWhatsapp } from "@/app/api/broadcast/whatsapp/route";
import { POST as sendToGroups } from "@/app/api/broadcast/teams-groups/route";
import { POST as createChain } from "@/app/api/broadcast/read-chain/route";
import { POST as schedule } from "@/app/api/broadcast/schedule/route";
import {
  DELETE as deleteScheduled,
  PATCH as updateScheduled,
} from "@/app/api/scheduled-broadcasts/[id]/route";

function planWith(overrides = {}) {
  return {
    id: 1,
    plan_started_at: null,
    max_users_override: null,
    plan: {
      id: 1,
      name: "Starter",
      level: 1,
      max_daily_messages_per_channel: 10,
      max_message_chars: 1500,
      max_files_per_message: 5,
      max_chain_messages: 10,
      max_scheduled_messages: 100,
      ...overrides,
    },
  };
}

const json = (body) => ({ json: () => Promise.resolve(body) });
const SCHEDULED_ID = "5f0c4a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationPlan.mockResolvedValue(planWith());
  mocks.claimAdminDailySend.mockResolvedValue({ ok: true, used: 1, limit: 10 });
  mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 3, failed: 0 });
  mocks.sendTeamsGroupBroadcast.mockResolvedValue({ ok: 1, failed: 0 });
  mocks.createMessageChain.mockResolvedValue({ id: "chain-1" });
  mocks.createScheduledBroadcast.mockResolvedValue({ id: SCHEDULED_ID });
  mocks.updateScheduledBroadcast.mockResolvedValue({ id: SCHEDULED_ID });
});

describe("claimDailySend", () => {
  it("conta desde as 00:01 de Lisboa e com o limite do plano", async () => {
    const now = new Date("2026-10-22T10:00:00Z");

    const result = await claimDailySend(1, "teams", { now });

    expect(result).toMatchObject({ used: 1, limit: 10 });
    expect(result.claimKey).toEqual(expect.any(String));
    expect(mocks.claimAdminDailySend).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 1,
        channel: "teams",
        units: 1,
        limit: 10,
        since: new Date("2026-10-21T23:01:00Z"),
      }),
    );
  });

  it("sem espaço, devolve o 409 com o que sobra e quando repõe", async () => {
    mocks.claimAdminDailySend.mockResolvedValue({
      ok: false,
      used: 8,
      limit: 10,
    });

    const result = await claimDailySend(1, "whatsapp", {
      units: 3,
      now: new Date("2026-10-22T10:00:00Z"),
    });

    expect(result.body).toEqual({
      error: "Plan limit reached: dailyMessagesPerChannel",
      code: "DAILY_LIMIT_REACHED",
      plan: "Starter",
      limit: 10,
      channel: "whatsapp",
      used: 8,
      remaining: 2,
      resetsAt: "2026-10-22T23:01:00.000Z",
    });
  });
});

describe("POST /api/broadcast/whatsapp", () => {
  const send = () =>
    sendWhatsapp(
      json({
        orgId: 1,
        recipients: [{ userId: 5 }, { userId: 6 }, { userId: 7 }],
        message: "olá",
      }),
    );

  it("um envio para 3 colaboradores conta 1", async () => {
    const response = await send();

    expect(response.status).toBe(200);
    expect(mocks.claimAdminDailySend).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        units: 1,
        sourceType: "broadcast",
      }),
    );
    expect(mocks.releaseAdminDailySend).not.toHaveBeenCalled();
  });

  it("no 10/10 é recusado antes de enviar", async () => {
    mocks.claimAdminDailySend.mockResolvedValue({
      ok: false,
      used: 10,
      limit: 10,
    });

    const response = await send();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "DAILY_LIMIT_REACHED",
      remaining: 0,
    });
    expect(mocks.sendWhatsappBroadcast).not.toHaveBeenCalled();
  });

  it("se não chegar a ninguém, o envio é devolvido", async () => {
    mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 0, failed: 3 });

    await send();

    expect(mocks.releaseAdminDailySend).toHaveBeenCalledTimes(1);
  });

  it("se o envio rebentar, também é devolvido", async () => {
    mocks.sendWhatsappBroadcast.mockRejectedValue(new Error("Bird em baixo"));

    const response = await send();

    expect(response.status).toBe(500);
    expect(mocks.releaseAdminDailySend).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/broadcast/teams-groups", () => {
  it("um envio para grupos conta 1 nos envios do Teams", async () => {
    const response = await sendToGroups(
      json({ orgId: 1, groupIds: [3], message: "olá" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.claimAdminDailySend).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "teams", units: 1 }),
    );
  });
});

describe("POST /api/broadcast/read-chain", () => {
  const create = (n) =>
    createChain(
      json({
        orgId: 1,
        channel: "teams",
        recipients: [{ userId: 5 }],
        steps: Array.from({ length: n }, (_, i) => ({
          message: `passo ${i + 1}`,
        })),
      }),
    );

  it("uma corrente de 5 mensagens conta 5 e fica ligada à corrente", async () => {
    await create(5).catch(() => {});

    expect(mocks.claimAdminDailySend).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "teams",
        units: 5,
        sourceType: "message_chain",
      }),
    );
    expect(mocks.setAdminDailySendSource).toHaveBeenCalledWith(
      expect.any(String),
      "chain-1",
    );
  });

  it("sem envios que cheguem para a corrente, nada é criado", async () => {
    mocks.claimAdminDailySend.mockResolvedValue({
      ok: false,
      used: 7,
      limit: 10,
    });

    const response = await create(5);

    expect(response.status).toBe(409);
    expect((await response.json()).remaining).toBe(3);
    expect(mocks.createMessageChain).not.toHaveBeenCalled();
  });
});

describe("POST /api/broadcast/schedule", () => {
  const scheduleIt = () =>
    schedule(
      json({
        orgId: 1,
        channel: "teams",
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
        payload: { message: "olá", userIds: [5] },
      }),
    );

  it("conta no dia em que se agenda e fica ligada à agendada", async () => {
    const response = await scheduleIt();

    expect(response.status).toBe(200);
    expect(mocks.claimAdminDailySend).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "teams",
        sourceType: "scheduled_broadcast",
      }),
    );
    expect(mocks.setAdminDailySendSource).toHaveBeenCalledWith(
      expect.any(String),
      SCHEDULED_ID,
    );
  });

  it("no 10/10 não agenda", async () => {
    mocks.claimAdminDailySend.mockResolvedValue({
      ok: false,
      used: 10,
      limit: 10,
    });

    const response = await scheduleIt();

    expect(response.status).toBe(409);
    expect(mocks.createScheduledBroadcast).not.toHaveBeenCalled();
  });
});

describe("/api/scheduled-broadcasts/[id]", () => {
  const params = { params: Promise.resolve({ id: SCHEDULED_ID }) };

  it("cancelar devolve o envio de hoje", async () => {
    const response = await updateScheduled(
      json({ status: "cancelled" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.refundScheduledSend).toHaveBeenCalledWith(
      SCHEDULED_ID,
      expect.any(Date),
    );
  });

  it("mudar só a hora não devolve nada", async () => {
    await updateScheduled(
      json({ scheduled_for: new Date(Date.now() + 86_400_000).toISOString() }),
      params,
    );

    expect(mocks.refundScheduledSend).not.toHaveBeenCalled();
  });

  it("eliminar devolve o envio de hoje", async () => {
    const response = await deleteScheduled(json({}), params);

    expect(response.status).toBe(200);
    expect(mocks.refundScheduledSend).toHaveBeenCalledWith(
      SCHEDULED_ID,
      expect.any(Date),
    );
  });
});
