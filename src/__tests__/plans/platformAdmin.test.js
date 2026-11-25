import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #208: área de administração dos planos, só para a equipa DIGIK (donos das
 * organizações 1 e 2). Mudar o plano de um cliente fica no histórico dele;
 * experimentar um plano na própria organização não.
 */

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  ownedOrg: null,
  getPlanById: vi.fn(),
  listOrganizationsWithPlan: vi.fn(),
  listPlans: vi.fn(),
  setOrganizationPlan: vi.fn(),
  updatePlan: vi.fn(),
  setOrganizationPlanStart: vi.fn(),
  listOwnerEmails: vi.fn(),
  getPlanByName: vi.fn(),
  recordSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: mocks.requireUser,
  jsonError: (message, status) => Response.json({ error: message }, { status }),
  parsePositiveInt: (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

vi.mock("@/lib/repos/plans.repo", () => ({
  getPlanById: mocks.getPlanById,
  listOrganizationsWithPlan: mocks.listOrganizationsWithPlan,
  listPlans: mocks.listPlans,
  setOrganizationPlan: mocks.setOrganizationPlan,
  setOrganizationPlanStart: mocks.setOrganizationPlanStart,
  listOwnerEmails: mocks.listOwnerEmails,
  updatePlan: mocks.updatePlan,
  getOrganizationPlan: vi.fn(),
  getPlanByName: mocks.getPlanByName,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordSystemAuditEvent: mocks.recordSystemAuditEvent,
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/user.repo", () => ({
  countUsersByOrg: vi.fn(async () => 5),
}));
vi.mock("@/lib/repos/assistants.repo", () => ({
  countAssistantsByOrg: vi.fn(async () => 1),
}));
vi.mock("@/lib/repos/automationRules.repo", () => ({
  countAutomationRulesByOrg: vi.fn(async () => 0),
}));
vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  countManualQueuedBroadcasts: vi.fn(async () => 2),
}));
vi.mock("@/lib/repos/adminDailySends.repo", () => ({
  countAdminDailySends: vi.fn(async () => ({ whatsapp: 3, teams: 1 })),
  claimAdminDailySend: vi.fn(),
  releaseAdminDailySend: vi.fn(),
}));
vi.mock("@/lib/repos/trackedLinkSaved.repo", () => ({
  countSavedTrackedLinks: vi.fn(async () => 7),
  saveTrackedLinks: vi.fn(),
}));

import { platformAdminOrgIds } from "@/lib/auth/platformAdmin";
import {
  getAdminOverview,
  planLimitsPatch,
} from "@/lib/services/plans/platformAdmin.service";
import { GET as overviewRoute } from "@/app/api/admin/overview/route";
import { GET as meRoute } from "@/app/api/admin/me/route";
import { PATCH as changePlanRoute } from "@/app/api/admin/organizations/[id]/route";
import { PATCH as editPlanRoute } from "@/app/api/admin/plans/[id]/route";
import { POST as extendRoute } from "@/app/api/admin/organizations/[id]/extend/route";
import { PATCH as endRoute } from "@/app/api/admin/organizations/[id]/end/route";

const PLANS = [
  {
    id: 1,
    name: "Demo",
    level: 0,
    is_public: true,
    duration_days: 7,
    max_users: 3,
  },
  {
    id: 2,
    name: "Starter",
    level: 1,
    is_public: true,
    duration_days: null,
    max_users: 100,
  },
  {
    id: 7,
    name: "Interno",
    level: 99,
    is_public: false,
    duration_days: null,
    max_users: null,
  },
];

/* O utilizador da sessão é dono da organização `orgId`. */
function signedInAs(orgId, planId = 7) {
  mocks.requireUser.mockResolvedValue({
    user: { id: "u1" },
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: orgId ? { id: orgId, plan_id: planId } : null,
              error: null,
            }),
          }),
        }),
      }),
    },
  });
}

const json = (body) => ({ json: async () => body });
const params = (id) => ({ params: Promise.resolve({ id: String(id) }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listOwnerEmails.mockResolvedValue({ o9: "dona@homa.pt" });
  mocks.getPlanByName.mockImplementation(async (name) =>
    PLANS.find((plan) => plan.name === name) || null,
  );
  delete process.env.PLATFORM_ADMIN_ORG_IDS;
  mocks.listPlans.mockResolvedValue(PLANS);
  mocks.getPlanById.mockImplementation(
    async (id) => PLANS.find((p) => p.id === Number(id)) || null,
  );
  mocks.listOrganizationsWithPlan.mockResolvedValue([
    {
      id: 1,
      name: "DIGIK",
      plan_id: 7,
      plan_started_at: "2026-10-23T10:00:00Z",
    },
    {
      id: 9,
      name: "Hôma",
      owner_user_id: "o9",
      plan_id: 1,
      plan_started_at: "2026-10-20T10:00:00Z",
      max_users_override: null,
    },
  ]);
  mocks.setOrganizationPlan.mockImplementation(async (orgId, planId) => ({
    id: orgId,
    plan_id: planId,
  }));
});

afterEach(() => {
  delete process.env.PLATFORM_ADMIN_ORG_IDS;
});

describe("quem é administrador", () => {
  it("por omissão, as organizações 1 (principal) e 2 (testes)", () => {
    expect(platformAdminOrgIds()).toEqual([1, 2]);
  });

  it("a lista pode vir do ambiente (réplica local)", () => {
    process.env.PLATFORM_ADMIN_ORG_IDS = "188";
    expect(platformAdminOrgIds()).toEqual([188]);
  });

  it("um cliente não vê nada da administração", async () => {
    signedInAs(9, 1);

    expect((await overviewRoute()).status).toBe(403);
    expect((await changePlanRoute(json({ planId: 2 }), params(9))).status).toBe(
      403,
    );
    expect(
      (await editPlanRoute(json({ limits: { users: 1 } }), params(2))).status,
    ).toBe(403);
    expect(await (await meRoute()).json()).toEqual({ isAdmin: false });
    expect(mocks.setOrganizationPlan).not.toHaveBeenCalled();
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  it("sem sessão, 401", async () => {
    mocks.requireUser.mockResolvedValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    expect((await overviewRoute()).status).toBe(401);
  });

  it("a conta DIGIK a experimentar outro plano continua administradora", async () => {
    signedInAs(2, 1);

    expect(await (await meRoute()).json()).toEqual({
      isAdmin: true,
      orgId: 2,
      plan: { id: 1, name: "Demo" },
      internalPlanId: 7,
      trying: true,
    });
  });
});

describe("visão geral", () => {
  it("cada organização com o plano, os dias da Demo e o uso", async () => {
    const overview = await getAdminOverview({
      now: new Date("2026-10-23T10:00:00Z"),
    });

    expect(overview.internalPlanId).toBe(7);
    expect(overview.plans.map((p) => [p.name, p.orgCount])).toEqual([
      ["Demo", 1],
      ["Starter", 0],
      ["Interno", 1],
    ]);

    const homa = overview.organizations.find((org) => org.id === 9);
    expect(homa).toMatchObject({
      plan: { id: 1, name: "Demo" },
      daysLeft: 4,
      expired: false,
      usage: {
        users: 5,
        assistants: 1,
        scheduledMessages: 2,
        dailySends: { whatsapp: 3, teams: 1 },
        trackedLinks: 7,
      },
    });
    expect(homa.limits.users).toBe(3);
  });
});

describe("mudar de plano", () => {
  it("o cliente fica com o plano novo e a mudança no histórico dele", async () => {
    signedInAs(1);

    const response = await changePlanRoute(json({ planId: 2 }), params(9));

    expect(response.status).toBe(200);
    expect(mocks.setOrganizationPlan).toHaveBeenCalledWith(
      9,
      2,
      expect.anything(),
    );
    expect(mocks.recordSystemAuditEvent).toHaveBeenCalledWith(9, {
      action: "organization.plan_changed",
      entityType: "organization",
      entityId: 9,
      details: { from: "Demo", to: "Starter" },
    });
  });

  it("experimentar na própria organização não vai para o histórico", async () => {
    signedInAs(2);
    mocks.listOrganizationsWithPlan.mockResolvedValue([
      { id: 2, name: "Testes", plan_id: 7 },
    ]);

    await changePlanRoute(json({ planId: 1 }), params(2));

    expect(mocks.setOrganizationPlan).toHaveBeenCalledWith(
      2,
      1,
      expect.anything(),
    );
    expect(mocks.recordSystemAuditEvent).not.toHaveBeenCalled();
  });

  it("um plano que não existe dá 404", async () => {
    signedInAs(1);

    expect(
      (await changePlanRoute(json({ planId: 55 }), params(9))).status,
    ).toBe(404);
    expect(mocks.setOrganizationPlan).not.toHaveBeenCalled();
  });
});

describe("editar os limites de um plano", () => {
  it("vazio quer dizer sem limite", () => {
    expect(
      planLimitsPatch({
        limits: { users: 50, trackedLinks: null },
        durationDays: "",
      }),
    ).toEqual({
      patch: { max_users: 50, max_tracked_links: null, duration_days: null },
    });
  });

  it("recusa números inválidos e acima dos máximos técnicos", () => {
    expect(planLimitsPatch({ limits: { users: 0 } }).error).toBeTruthy();
    expect(planLimitsPatch({ limits: { users: 2.5 } }).error).toBeTruthy();
    expect(planLimitsPatch({ limits: { chainMessages: 11 } }).error).toMatch(
      /10/,
    );
    expect(planLimitsPatch({ limits: { fileSizeMb: 60 } }).error).toMatch(/50/);
    expect(planLimitsPatch({ limits: { inventado: 1 } }).error).toBeTruthy();
  });

  it("grava pela rota, só para administradores", async () => {
    signedInAs(1);
    mocks.updatePlan.mockResolvedValue({ ...PLANS[1], max_users: 50 });

    const response = await editPlanRoute(
      json({ limits: { users: 50 } }),
      params(2),
    );

    expect(response.status).toBe(200);
    expect(mocks.updatePlan).toHaveBeenCalledWith(2, { max_users: 50 });
    expect((await response.json()).plan.limits.users).toBe(50);
  });

  it("um valor inválido dá 400 sem gravar", async () => {
    signedInAs(1);

    const response = await editPlanRoute(
      json({ limits: { chainMessages: 20 } }),
      params(2),
    );

    expect(response.status).toBe(400);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });
});

describe("melhorias da administração", () => {
  it("mostra o email do dono e os limites ultrapassados", async () => {
    const overview = await getAdminOverview({
      now: new Date("2026-10-23T10:00:00Z"),
    });
    const homa = overview.organizations.find((org) => org.id === 9);

    expect(homa.ownerEmail).toBe("dona@homa.pt");
    /* 5 utilizadores com 3 na Demo. */
    expect(homa.overLimits).toEqual(["users"]);
    expect(homa.isPlatformOrg).toBe(false);
    expect(
      overview.organizations.find((org) => org.id === 1).isPlatformOrg,
    ).toBe(true);
  });

  it("sem os emails, a visão geral continua a funcionar", async () => {
    mocks.listOwnerEmails.mockRejectedValue(new Error("auth em baixo"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const overview = await getAdminOverview();

    expect(
      overview.organizations.find((org) => org.id === 9).ownerEmail,
    ).toBeNull();
  });

  it("o plano Interno não se dá a um cliente", async () => {
    signedInAs(1);

    const response = await changePlanRoute(json({ planId: 7 }), params(9));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INTERNAL_PLAN_RESERVED");
    expect(mocks.setOrganizationPlan).not.toHaveBeenCalled();
  });

  it("as organizações da DIGIK podem voltar ao Interno", async () => {
    signedInAs(2, 1);
    mocks.listOrganizationsWithPlan.mockResolvedValue([
      { id: 2, name: "Testes", plan_id: 1 },
    ]);

    const response = await changePlanRoute(json({ planId: 7 }), params(2));

    expect(response.status).toBe(200);
  });

  it("o plano Interno não se edita", async () => {
    signedInAs(1);

    const response = await editPlanRoute(
      json({ limits: { users: 5 } }),
      params(7),
    );

    expect(response.status).toBe(403);
    expect(mocks.updatePlan).not.toHaveBeenCalled();
  });

  it("+7 dias conta a partir do fim atual e fica no histórico do cliente", async () => {
    signedInAs(1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T10:00:00Z"));

    try {
      /* A Demo da Hôma começou a 20/10: acabava a 27/10, passa a 03/11. */
      const response = await extendRoute(json({}), params(9));

      expect(response.status).toBe(200);
      expect(mocks.setOrganizationPlanStart).toHaveBeenCalledWith(
        9,
        new Date("2026-10-27T10:00:00Z"),
      );
      expect(mocks.recordSystemAuditEvent).toHaveBeenCalledWith(9, {
        action: "organization.plan_extended",
        entityType: "organization",
        entityId: 9,
        details: { plan: "Demo", days: 7, until: "2026-11-03T10:00:00.000Z" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uma Demo já terminada ganha 7 dias a partir de hoje", async () => {
    signedInAs(1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));

    try {
      await extendRoute(json({}), params(9));

      /* Acaba a 17/11: o início fica 7 dias antes, a 10/11. */
      expect(mocks.setOrganizationPlanStart).toHaveBeenCalledWith(
        9,
        new Date("2026-11-10T10:00:00Z"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("um plano sem prazo não se prolonga", async () => {
    signedInAs(1);
    mocks.listOrganizationsWithPlan.mockResolvedValue([
      { id: 5, name: "Starter", plan_id: 2 },
    ]);

    const response = await extendRoute(json({}), params(5));

    expect(response.status).toBe(400);
    expect(mocks.setOrganizationPlanStart).not.toHaveBeenCalled();
  });
});

describe("escolher o dia em que a Demo termina", () => {
  const setEnd = (endsOn, orgId = 9) =>
    endRoute(json({ endsOn }), params(orgId));

  beforeEach(() => {
    signedInAs(1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("desfaz um +7 dias a mais: o dia escolhido conta até às 23:59 de Lisboa", async () => {
    const response = await setEnd("2026-11-04");

    expect(response.status).toBe(200);
    /* Inverno (UTC+0): 23:59 de Lisboa = 23:59 UTC; o início é 7 dias antes. */
    expect(mocks.setOrganizationPlanStart).toHaveBeenCalledWith(
      9,
      new Date("2026-10-28T23:59:00Z"),
    );
    expect(mocks.recordSystemAuditEvent).toHaveBeenCalledWith(9, {
      action: "organization.plan_end_changed",
      entityType: "organization",
      entityId: 9,
      details: { plan: "Demo", until: "2026-11-04T23:59:00.000Z" },
    });
  });

  it("hoje pode ser o último dia", async () => {
    expect((await setEnd("2026-10-26")).status).toBe(200);
  });

  it.each([
    ["2026-10-25", "DATE_IN_THE_PAST"],
    ["2027-02-10", "DATE_TOO_FAR"],
    ["2026-02-30", "INVALID_DATE"],
    ["amanhã", "INVALID_DATE"],
  ])("%s é recusado (%s)", async (endsOn, error) => {
    const response = await setEnd(endsOn);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
    expect(mocks.setOrganizationPlanStart).not.toHaveBeenCalled();
  });

  it("um plano sem prazo não tem fim", async () => {
    mocks.listOrganizationsWithPlan.mockResolvedValue([
      { id: 5, name: "Starter", plan_id: 2 },
    ]);

    expect((await setEnd("2026-11-04", 5)).status).toBe(400);
  });

  it("um cliente não muda nada", async () => {
    signedInAs(9, 1);

    expect((await setEnd("2026-11-04")).status).toBe(403);
    expect(mocks.setOrganizationPlanStart).not.toHaveBeenCalled();
  });
});

describe("antes de correr a migração do plano Interno", () => {
  it("sem o plano Interno, não conta como estar a experimentar", async () => {
    signedInAs(1, 6);
    mocks.getPlanById.mockResolvedValue({ id: 6, name: "Enterprise" });
    mocks.getPlanByName.mockResolvedValue(null);

    expect(await (await meRoute()).json()).toEqual({
      isAdmin: true,
      orgId: 1,
      plan: { id: 6, name: "Enterprise" },
      internalPlanId: null,
      trying: false,
    });
  });
});
