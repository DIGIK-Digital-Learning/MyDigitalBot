import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrgLimits: vi.fn(),
  countAssistantsByOrg: vi.fn(),
  createAssistant: vi.fn(),
  createUserWithAutomations: vi.fn(),
}));

vi.mock("@/lib/db/readAccess", () => ({
  withSessionReadAccess: (_supabase, fn) => fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  parsePositiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
  requireOwnedOrg: vi.fn(async (orgId) => ({ orgId: Number(orgId), admin: {} })),
  requireOrgForUser: vi.fn(),
  assertAssistantBelongsToOrg: vi.fn(async () => null),
  assertAssistantsBelongToOrg: vi.fn(async () => []),
  assertTagsBelongToOrg: vi.fn(),
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
vi.mock("@/lib/repos/trackedLinkSaved.repo", () => ({
  countSavedTrackedLinks: vi.fn(async () => 37),
  saveTrackedLinks: vi.fn(async () => ({ ok: true, used: 37, limit: 100, added: 0 })),
}));
vi.mock("@/lib/services/plans/planLimits", async (importOriginal) => ({
  ...(await importOriginal()),
  getOrgLimits: mocks.getOrgLimits,
}));

/* O gasto (#186) vem das mesmas contagens que as rotas usam para recusar. */
vi.mock("@/lib/repos/automationRules.repo", () => ({
  countAutomationRulesByOrg: vi.fn(async () => 6),
}));

vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  countManualQueuedBroadcasts: vi.fn(async () => 2),
}));

vi.mock("@/lib/repos/assistants.repo", () => ({
  countAssistantsByOrg: mocks.countAssistantsByOrg,
  createAssistant: mocks.createAssistant,
  getAssistantsInOrg: vi.fn(),
}));

vi.mock("@/lib/repos/user.repo", () => ({
  countUsersByOrg: vi.fn(async () => 3),
  createUser: vi.fn(),
  getUsersInOrg: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/services/automations/createUserWithAutomations", () => ({
  createUserWithAutomations: mocks.createUserWithAutomations,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/services/audit/auditLookups", () => ({
  lookupAssistantName: vi.fn(async () => null),
}));

import { POST as createAssistantRoute } from "@/app/api/assistants/route";
import { POST as createUserRoute } from "@/app/api/users/route";
import { GET as planLimitsRoute } from "@/app/api/plans/limits/route";
import { requireOwnedOrg } from "@/lib/auth/guards";

const request = (body) => ({ json: () => Promise.resolve(body) });

function planWith(limits, name = "Demo") {
  return { plan: { id: 1, name, level: 0 }, limits };
}

describe("POST /api/assistants — limite de assistentes do plano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAssistant.mockResolvedValue({ id: 99, name: "Novo" });
  });

  const body = { organizationId: 7, name: "Novo", model: "gpt-5.6-luna" };

  it("cria enquanto há lugar no plano", async () => {
    mocks.getOrgLimits.mockResolvedValue(planWith({ assistants: 20 }, "Starter"));
    mocks.countAssistantsByOrg.mockResolvedValue(19);

    const response = await createAssistantRoute(request(body));

    expect(response.status).not.toBe(409);
    expect(mocks.createAssistant).toHaveBeenCalled();
  });

  it("no limite, recusa com o código, o plano e o máximo, e não cria", async () => {
    mocks.getOrgLimits.mockResolvedValue(planWith({ assistants: 1 }));
    mocks.countAssistantsByOrg.mockResolvedValue(1);

    const response = await createAssistantRoute(request(body));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Plan limit reached: assistants",
      code: "ASSISTANT_LIMIT_REACHED",
      plan: "Demo",
      limit: 1,
    });
    expect(mocks.createAssistant).not.toHaveBeenCalled();
  });

  it("um plano sem limite cria sempre", async () => {
    mocks.getOrgLimits.mockResolvedValue(planWith({ assistants: null }, "Enterprise"));
    mocks.countAssistantsByOrg.mockResolvedValue(500);

    const response = await createAssistantRoute(request(body));

    expect(response.status).not.toBe(409);
    expect(mocks.createAssistant).toHaveBeenCalled();
  });
});

describe("POST /api/users — limite de utilizadores do plano", () => {
  beforeEach(() => vi.clearAllMocks());

  const body = { organizationId: 7, name: "Ana", email: "ana@exemplo.pt" };

  function limitReached() {
    const error = new Error("User limit reached for this organization");
    error.code = "USER_LIMIT_REACHED";
    return error;
  }

  it("quando a base de dados recusa, devolve o código, o plano e o máximo", async () => {
    mocks.createUserWithAutomations.mockRejectedValue(limitReached());
    mocks.getOrgLimits.mockResolvedValue(planWith({ users: 3 }));

    const response = await createUserRoute(request(body));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Plan limit reached: users",
      code: "USER_LIMIT_REACHED",
      plan: "Demo",
      limit: 3,
    });
  });

  it("sem conseguir ler o plano, o código chega na mesma", async () => {
    mocks.createUserWithAutomations.mockRejectedValue(limitReached());
    mocks.getOrgLimits.mockRejectedValue(new Error("db down"));

    const response = await createUserRoute(request(body));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "USER_LIMIT_REACHED",
      plan: null,
      limit: null,
    });
  });

  it("outro erro (utilizador repetido) não fala em limite", async () => {
    const duplicate = new Error("duplicate key");
    duplicate.code = "23505";
    mocks.createUserWithAutomations.mockRejectedValue(duplicate);

    const response = await createUserRoute(request(body));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBeUndefined();
    expect(json.error).toMatch(/duplicate/i);
  });
});

describe("GET /api/plans/limits", () => {
  beforeEach(() => vi.clearAllMocks());

  const get = (query) =>
    planLimitsRoute(new Request(`http://localhost/api/plans/limits${query}`));

  it("devolve o plano, os limites e o gasto ao dono da organização", async () => {
    mocks.getOrgLimits.mockResolvedValue({
      ...planWith({ assistantInstructionChars: 5000 }),
      expiresAt: null,
      expired: false,
      startedAt: new Date(),
    });

    mocks.countAssistantsByOrg.mockResolvedValue(1);

    const response = await get("?orgId=7");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      plan: { id: 1, name: "Demo", level: 0 },
      limits: { assistantInstructionChars: 5000 },
      usage: {
        users: 3,
        assistants: 1,
        automations: 6,
        scheduledMessages: 2,
        dailySends: { whatsapp: 0, teams: 0 },
        trackedLinks: 37,
      },
      dailySendsResetAt: expect.any(String),
      expiresAt: null,
      expired: false,
    });
  });

  it("não mostra os limites de outra organização", async () => {
    requireOwnedOrg.mockResolvedValueOnce({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await get("?orgId=99");

    expect(response.status).toBe(403);
    expect(mocks.getOrgLimits).not.toHaveBeenCalled();
  });

  it("sem organização é um pedido inválido", async () => {
    const response = await get("");
    expect(response.status).toBe(400);
  });
});
