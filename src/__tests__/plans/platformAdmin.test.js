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
  updatePlan: mocks.updatePlan,
  getOrganizationPlan: vi.fn(),
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
