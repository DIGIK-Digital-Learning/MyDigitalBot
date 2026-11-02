import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #209: a Demo dura 7 dias. Depois, criar e enviar fica bloqueado, o
 * assistente deixa de responder (com um aviso, uma vez por canal) e os crons
 * deixam o trabalho dessas empresas à espera. Os planos sem prazo nunca
 * acabam.
 */

const mocks = vi.hoisted(() => ({
  requireOrgForAutomationRule: vi.fn(),
  updateAutomationRule: vi.fn(),
  getDueScheduledBroadcasts: vi.fn(),
  getExpiredOrganizationIds: vi.fn(),
}));

vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal()),
  requireOrgForAutomationRule: mocks.requireOrgForAutomationRule,
  assertAssistantBelongsToOrg: vi.fn(async (_admin, _orgId, id) => id),
}));

vi.mock("@/lib/repos/automationRules.repo", () => ({
  assertNoActiveInactivityRuleConflict: vi.fn(),
  deleteAutomationRule: vi.fn(),
  updateAutomationRule: mocks.updateAutomationRule,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
  recordSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  getDueScheduledBroadcasts: mocks.getDueScheduledBroadcasts,
  markScheduledBroadcastProcessing: vi.fn(),
  finishScheduledBroadcast: vi.fn(),
}));

vi.mock("@/lib/repos/automationRuns.repo", () => ({
  getAutomationRunForScheduledBroadcast: vi.fn(),
  markAutomationRunFailed: vi.fn(),
  markAutomationRunProcessing: vi.fn(),
  markAutomationRunSent: vi.fn(),
}));
vi.mock("@/lib/services/broadcast/sendWhatsappBroadcast", () => ({
  sendWhatsappBroadcast: vi.fn(),
}));
vi.mock("@/lib/services/broadcast/sendTeamsBroadcast", () => ({
  sendTeamsBroadcast: vi.fn(),
}));
vi.mock("@/lib/services/broadcast/sendTeamsGroupBroadcast", () => ({
  sendTeamsGroupBroadcast: vi.fn(),
}));

vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    getExpiredOrganizationIds: mocks.getExpiredOrganizationIds,
    /* A rota de automações lê o plano através de checkPlanActive. */
    checkPlanActive: vi.fn(async (orgId) => {
      const orgLimits = await original.getOrgLimits(orgId, {
        deps: { getOrganizationPlan: async () => planRow(currentPlan) },
      });
      const body = original.planExpiredBody(orgLimits);
      return body ? { orgLimits, body } : { orgLimits };
    }),
  };
});

import {
  claimDailySend,
  getOrgLimits,
  planExpiredBody,
  saveTrackedLinksWithinPlan,
} from "@/lib/services/plans/planLimits";
import { checkCollaboratorPlanActive } from "@/lib/services/plans/planExpiredNotice";
import { demoStatus } from "@/lib/plans/demoStatus";
import { PATCH as patchRule } from "@/app/api/automations/rules/[id]/route";
import { GET as processScheduled } from "@/app/api/cron/process-scheduled-broadcasts/route";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-02T10:00:00Z");

/* Demo começada há `daysAgo` dias; `durationDays` null = plano sem prazo. */
let currentPlan = { daysAgo: 8, durationDays: 7 };

function planRow({ daysAgo, durationDays }) {
  return {
    id: 7,
    plan_started_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    max_users_override: null,
    plan: {
      id: 1,
      name: durationDays ? "Demo" : "Starter",
      level: 0,
      duration_days: durationDays,
      max_daily_messages_per_channel: 10,
      max_tracked_links: 100,
    },
  };
}

const limitsFor = (plan) =>
  getOrgLimits(7, {
    now: NOW,
    deps: { getOrganizationPlan: async () => planRow(plan) },
  });

beforeEach(() => {
  vi.clearAllMocks();
  currentPlan = { daysAgo: 8, durationDays: 7 };
});

describe("fim da Demo", () => {
  it("ao fim de 7 dias a Demo terminou e o corpo diz PLAN_EXPIRED", async () => {
    const orgLimits = await limitsFor({ daysAgo: 8, durationDays: 7 });

    expect(orgLimits.expired).toBe(true);
    expect(planExpiredBody(orgLimits)).toMatchObject({
      code: "PLAN_EXPIRED",
      plan: "Demo",
      expiresAt: new Date(NOW.getTime() - DAY).toISOString(),
    });
  });

  it("dentro dos 7 dias, ou num plano sem prazo, não há bloqueio", async () => {
    expect(
      planExpiredBody(await limitsFor({ daysAgo: 3, durationDays: 7 })),
    ).toBeNull();
    expect(
      planExpiredBody(await limitsFor({ daysAgo: 400, durationDays: null })),
    ).toBeNull();
  });

  it("não reserva envios nem guarda links com a Demo terminada", async () => {
    const orgLimits = await limitsFor({ daysAgo: 8, durationDays: 7 });
    const claimAdminDailySend = vi.fn();
    const saveTrackedLinks = vi.fn();

    const daily = await claimDailySend(7, "whatsapp", {
      orgLimits,
      now: NOW,
      deps: { claimAdminDailySend },
    });
    const links = await saveTrackedLinksWithinPlan(
      7,
      [{ label: "Site", destinationUrl: "https://exemplo.pt" }],
      { orgLimits, deps: { saveTrackedLinks } },
    );

    expect(daily.body.code).toBe("PLAN_EXPIRED");
    expect(links.body.code).toBe("PLAN_EXPIRED");
    expect(claimAdminDailySend).not.toHaveBeenCalled();
    expect(saveTrackedLinks).not.toHaveBeenCalled();
  });
});

describe("organizações com a Demo terminada (para os crons)", () => {
  /* A verdadeira: no resto do ficheiro, o cron recebe uma lista feita. */
  const realGetExpiredOrganizationIds = async (options) =>
    (
      await vi.importActual("@/lib/services/plans/planLimits")
    ).getExpiredOrganizationIds(options);

  it("só as que já passaram do prazo", async () => {
    const rows = [
      { id: 1, ...planRow({ daysAgo: 8, durationDays: 7 }) },
      { id: 2, ...planRow({ daysAgo: 2, durationDays: 7 }) },
      { id: 3, plan_started_at: null, plan: { duration_days: 7 } },
    ].map((row, index) => ({ ...row, id: index + 1 }));

    const ids = await realGetExpiredOrganizationIds({
      now: NOW,
      deps: { listOrganizationsWithPlanDuration: async () => rows },
    });

    expect(ids).toEqual([1]);
  });

  it("se a leitura falhar, não exclui ninguém", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const ids = await realGetExpiredOrganizationIds({
      deps: {
        listOrganizationsWithPlanDuration: async () => {
          throw new Error("base em baixo");
        },
      },
    });

    expect(ids).toEqual([]);
  });

  it("o cron das agendadas deixa de fora essas organizações", async () => {
    process.env.CRON_SECRET = "segredo";
    mocks.getExpiredOrganizationIds.mockResolvedValue([7, 9]);
    mocks.getDueScheduledBroadcasts.mockResolvedValue([]);

    await processScheduled(
      new Request("http://localhost/api/cron/process-scheduled-broadcasts", {
        headers: { authorization: "Bearer segredo" },
      }),
    );

    expect(mocks.getDueScheduledBroadcasts).toHaveBeenCalledWith(
      expect.any(Number),
      { excludeOrganizationIds: [7, 9] },
    );
  });
});

describe("o assistente com a Demo terminada", () => {
  const organization = { id: 7, locale: "pt" };
  const user = { id: 5 };

  const check = (
    plan,
    claimLimitNotice = vi.fn(async () => true),
    org = organization,
  ) =>
    checkCollaboratorPlanActive(
      { organization: org, user, channel: "whatsapp" },
      {
        now: NOW,
        deps: {
          getOrgLimits: (orgId, options) =>
            getOrgLimits(orgId, {
              ...options,
              deps: { getOrganizationPlan: async () => planRow(plan) },
            }),
          claimLimitNotice,
        },
      },
    );

  it("dentro da Demo responde normalmente", async () => {
    const claimLimitNotice = vi.fn();
    const result = await check(
      { daysAgo: 3, durationDays: 7 },
      claimLimitNotice,
    );

    expect(result).toEqual({ allowed: true, notice: null });
    expect(claimLimitNotice).not.toHaveBeenCalled();
  });

  it("a primeira mensagem depois do fim recebe o aviso, guardado com o fim da Demo", async () => {
    const claimLimitNotice = vi.fn(async () => true);
    const result = await check(
      { daysAgo: 8, durationDays: 7 },
      claimLimitNotice,
    );

    expect(result.allowed).toBe(false);
    expect(result.notice).toMatch(/não está disponível/);
    expect(claimLimitNotice).toHaveBeenCalledWith({
      userId: 5,
      channel: "whatsapp",
      periodStart: new Date(NOW.getTime() - DAY),
    });
  });

  it("as seguintes ficam sem resposta", async () => {
    const result = await check(
      { daysAgo: 8, durationDays: 7 },
      vi.fn(async () => false),
    );

    expect(result).toEqual({ allowed: false, notice: null });
  });

  it("o aviso vai na língua da organização", async () => {
    const result = await check(
      { daysAgo: 8, durationDays: 7 },
      vi.fn(async () => true),
      { id: 7, locale: "en" },
    );

    expect(result.notice).toMatch(/isn't available/);
  });

  it("se a leitura falhar, responde na mesma", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkCollaboratorPlanActive(
      { organization, user, channel: "teams" },
      {
        deps: {
          getOrgLimits: async () => {
            throw new Error("base em baixo");
          },
        },
      },
    );

    expect(result).toEqual({ allowed: true, notice: null });
  });
});

describe("PATCH /api/automations/rules/[id] com a Demo terminada", () => {
  const params = { params: Promise.resolve({ id: "3" }) };
  const request = (body) => ({ json: async () => body });

  function ruleIs(isActive) {
    mocks.requireOrgForAutomationRule.mockResolvedValue({
      orgId: 7,
      ruleId: 3,
      admin: {},
      rule: {
        id: 3,
        name: "Boas-vindas",
        is_active: isActive,
        trigger_type: "user.created",
        channel: "whatsapp",
      },
    });
    mocks.updateAutomationRule.mockResolvedValue({ id: 3 });
  }

  it("ativar uma automação é recusado", async () => {
    ruleIs(false);

    const response = await patchRule(request({ is_active: true }), params);

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("PLAN_EXPIRED");
    expect(mocks.updateAutomationRule).not.toHaveBeenCalled();
  });

  it("desativar continua a dar", async () => {
    ruleIs(true);

    const response = await patchRule(request({ is_active: false }), params);

    expect(response.status).toBe(200);
    expect(mocks.updateAutomationRule).toHaveBeenCalled();
  });

  it("dentro da Demo, ativar dá", async () => {
    currentPlan = { daysAgo: 3, durationDays: 7 };
    ruleIs(false);

    const response = await patchRule(request({ is_active: true }), params);

    expect(response.status).toBe(200);
  });
});

describe("faixa da Demo", () => {
  const at = (days) => new Date(NOW.getTime() + days * DAY).toISOString();

  it("diz quantos dias faltam, arredondados para cima", () => {
    expect(demoStatus({ expiresAt: at(4.5) }, NOW)).toEqual({
      stage: "active",
      daysLeft: 5,
    });
  });

  it("fica laranja a partir de 2 dias", () => {
    expect(demoStatus({ expiresAt: at(2) }, NOW)).toEqual({
      stage: "warning",
      daysLeft: 2,
    });
    expect(demoStatus({ expiresAt: at(0.2) }, NOW)).toEqual({
      stage: "warning",
      daysLeft: 1,
    });
  });

  it("fica vermelha quando termina, e o servidor manda sobre o relógio", () => {
    expect(demoStatus({ expiresAt: at(-1) }, NOW).stage).toBe("ended");
    expect(demoStatus({ expiresAt: at(3), expired: true }, NOW).stage).toBe(
      "ended",
    );
  });

  it("num plano sem prazo não aparece", () => {
    expect(demoStatus({ expiresAt: null }, NOW)).toBeNull();
  });
});
