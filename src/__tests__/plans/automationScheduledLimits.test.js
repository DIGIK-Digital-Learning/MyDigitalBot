import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #186: até 20 automações por conta (contam todas, ativas e inativas) e até
 * 100 mensagens agendadas à espera (só as feitas à mão; as das automações não
 * contam e nunca são bloqueadas).
 */

const mocks = vi.hoisted(() => ({
  getOrgLimits: vi.fn(),
  countAutomationRulesByOrg: vi.fn(),
  createAutomationRule: vi.fn(),
  countManualQueuedBroadcasts: vi.fn(),
  createScheduledBroadcast: vi.fn(),
  buildScheduledPayload: vi.fn(),
  queryRows: vi.fn(),
}));

vi.mock("@/lib/db/readAccess", () => ({
  withSessionReadAccess: (_auth, fn) => fn(),
  getRepositoryReadClient: vi.fn(),
}));

vi.mock("@/lib/db/admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve) => resolve({ data: mocks.queryRows(), error: null }),
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: vi.fn(async () => ({ orgId: 1, user: { id: "admin" }, admin: {} })),
  assertAssistantBelongsToOrg: vi.fn(async () => null),
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

/* Limite diário de envios (#188): tem testes próprios; aqui há sempre espaço. */
vi.mock("@/lib/repos/adminDailySends.repo", () => ({
  claimAdminDailySend: vi.fn(async () => ({ ok: true, used: 1, limit: 10 })),
  setAdminDailySendSource: vi.fn(async () => {}),
  releaseAdminDailySend: vi.fn(async () => {}),
  refundScheduledSend: vi.fn(async () => {}),
  countAdminDailySends: vi.fn(async () => ({ whatsapp: 0, teams: 0 })),
}));
vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => ({
  ...(await importOriginal()),
  getOrgLimits: mocks.getOrgLimits,
}));

vi.mock("@/lib/repos/automationRules.repo", () => ({
  countAutomationRulesByOrg: mocks.countAutomationRulesByOrg,
  createAutomationRule: mocks.createAutomationRule,
  getOrgAutomationRules: vi.fn(),
  assertNoActiveInactivityRuleConflict: vi.fn(),
}));

vi.mock("@/lib/services/automations/automationEngine", () => ({
  sanitizeAutomationPayload: (payload) => payload ?? {},
}));

/* Nas rotas, o repo é simulado; o teste da contagem usa o verdadeiro (importActual). */
vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  countManualQueuedBroadcasts: mocks.countManualQueuedBroadcasts,
  createScheduledBroadcast: mocks.createScheduledBroadcast,
}));

vi.mock("@/lib/services/broadcast/scheduledPayload", () => ({
  buildScheduledPayload: mocks.buildScheduledPayload,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

import { POST as createRule } from "@/app/api/automations/rules/route";
import { POST as schedule } from "@/app/api/broadcast/schedule/route";

const LIMITS = {
  plan: { id: 1, name: "Demo", level: 0 },
  limits: { automations: 20, scheduledMessages: 100 },
};

const json = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrgLimits.mockResolvedValue(LIMITS);
  mocks.createAutomationRule.mockResolvedValue({ id: 9, name: "Regra" });
  mocks.buildScheduledPayload.mockResolvedValue({
    payload: { recipients: [{ userId: 1 }] },
    recipientCount: 1,
  });
  mocks.createScheduledBroadcast.mockResolvedValue({ id: "s1" });
});

describe("POST /api/automations/rules — 20 automações", () => {
  const create = () =>
    createRule(
      json({
        organization_id: 1,
        name: "Regra",
        trigger_type: "user.created",
        channel: "whatsapp",
      }),
    );

  it("cria a 20.ª", async () => {
    mocks.countAutomationRulesByOrg.mockResolvedValue(19);

    const response = await create();

    expect(response.status).not.toBe(409);
    expect(mocks.createAutomationRule).toHaveBeenCalled();
  });

  it("recusa a 21.ª com o código e o máximo, e não cria", async () => {
    mocks.countAutomationRulesByOrg.mockResolvedValue(20);

    const response = await create();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "AUTOMATION_LIMIT_REACHED",
      plan: "Demo",
      limit: 20,
    });
    expect(mocks.createAutomationRule).not.toHaveBeenCalled();
  });
});

describe("POST /api/broadcast/schedule — 100 agendadas", () => {
  const scheduleOne = () =>
    schedule(
      json({
        orgId: 1,
        channel: "whatsapp",
        scheduledFor: "2099-01-01T12:00:00Z",
        payload: { recipients: [{ userId: 1 }] },
      }),
    );

  it("agenda a 100.ª", async () => {
    mocks.countManualQueuedBroadcasts.mockResolvedValue(99);

    const response = await scheduleOne();

    expect(response.status).toBe(200);
    expect(mocks.createScheduledBroadcast).toHaveBeenCalled();
  });

  it("recusa a 101.ª antes de ir buscar os destinatários, e não grava", async () => {
    mocks.countManualQueuedBroadcasts.mockResolvedValue(100);

    const response = await scheduleOne();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "SCHEDULED_LIMIT_REACHED",
      limit: 100,
    });
    expect(mocks.buildScheduledPayload).not.toHaveBeenCalled();
    expect(mocks.createScheduledBroadcast).not.toHaveBeenCalled();
  });
});

describe("countManualQueuedBroadcasts — só conta as agendadas à mão", () => {
  it("as das automações (de qualquer forma marcadas) não contam", async () => {
    const { countManualQueuedBroadcasts } = await vi.importActual(
      "@/lib/repos/scheduledBroadcasts.repo",
    );
    mocks.queryRows.mockReturnValue([
      { id: 1, payload: { recipients: [] } },
      { id: 2, payload: { message: "olá" } },
      { id: 3, payload: { _automation: { ruleId: 4 } } },
      { id: 4, payload: { automationRunId: 7 } },
      { id: 5, payload: { source: "automation" } },
      { id: 6, payload: null },
    ]);

    expect(await countManualQueuedBroadcasts(1)).toBe(3);
  });
});
