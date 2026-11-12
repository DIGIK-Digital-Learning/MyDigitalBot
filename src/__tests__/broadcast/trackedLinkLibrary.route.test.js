import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  listReusableTrackedLinks: vi.fn(),
  saveTrackedLinksWithinPlan: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  parsePositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  },
  requireOwnedOrg: mocks.requireOwnedOrg,
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

vi.mock("@/lib/services/broadcast/trackedLinks", () => ({
  listReusableTrackedLinks: mocks.listReusableTrackedLinks,
}));

vi.mock("@/lib/services/plans/planLimits", () => ({
  saveTrackedLinksWithinPlan: mocks.saveTrackedLinksWithinPlan,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

import { GET, POST } from "@/app/api/tracked-links/library/route";

const request = (orgId) => ({
  nextUrl: new URL(`http://localhost/api/tracked-links/library?orgId=${orgId}`),
});

describe("GET /api/tracked-links/library", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejeita um pedido sem organização", async () => {
    const response = await GET({
      nextUrl: new URL("http://localhost/api/tracked-links/library"),
    });

    expect(response.status).toBe(400);
    expect(mocks.requireOwnedOrg).not.toHaveBeenCalled();
  });

  it("não mostra os links de outra organização", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(request(99));

    expect(response.status).toBe(403);
    expect(mocks.listReusableTrackedLinks).not.toHaveBeenCalled();
  });

  it("devolve os links da organização confirmada pelo guard", async () => {
    const items = [
      { key: "guia", label: "Guia MFA", destinationUrl: "https://x.pt" },
    ];
    mocks.requireOwnedOrg.mockResolvedValue({
      orgId: 7,
      user: { id: "owner-test" },
      supabase: { from: vi.fn() },
    });
    mocks.listReusableTrackedLinks.mockResolvedValue(items);

    const response = await GET(request(7));

    expect(response.status).toBe(200);
    expect(mocks.requireOwnedOrg).toHaveBeenCalledWith(7);
    expect(mocks.listReusableTrackedLinks).toHaveBeenCalledWith(7);
    expect(await response.json()).toEqual({ items });
  });
});

/* Criar um link na página dos links, sem enviar uma mensagem. */
describe("POST /api/tracked-links/library", () => {
  const post = (body) => POST({ json: () => Promise.resolve(body) });
  const GUIA = {
    orgId: 7,
    label: "  Guia MFA ",
    destinationUrl: " https://x.pt/guia ",
  };
  const orgAuth = { orgId: 7, user: { id: "owner-test" } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnedOrg.mockResolvedValue(orgAuth);
    mocks.saveTrackedLinksWithinPlan.mockResolvedValue({ added: 1 });
  });

  it("grava o link com a gravação dos envios e regista no histórico", async () => {
    const response = await post(GUIA);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, created: true });
    expect(mocks.saveTrackedLinksWithinPlan).toHaveBeenCalledWith(7, [
      { label: "Guia MFA", destinationUrl: "https://x.pt/guia" },
    ]);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      orgAuth,
      expect.objectContaining({
        action: "tracked_link.created",
        entityLabel: "Guia MFA",
      }),
    );
  });

  it("um link que já existe não é criado outra vez nem fica no histórico", async () => {
    mocks.saveTrackedLinksWithinPlan.mockResolvedValue({ added: 0 });

    const response = await post(GUIA);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, created: false });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("no limite do plano devolve o 409 dos envios", async () => {
    const limit = {
      error: "Plan limit reached: trackedLinks",
      code: "TRACKED_LINKS_LIMIT_REACHED",
      plan: "Starter",
      limit: 100,
      used: 100,
      added: 1,
    };
    mocks.saveTrackedLinksWithinPlan.mockResolvedValue({ body: limit });

    const response = await post(GUIA);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(limit);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["sem nome", { ...GUIA, label: "   " }, "TRACKED_LINK_INVALID_LABEL"],
    [
      "nome comprido",
      { ...GUIA, label: "a".repeat(101) },
      "TRACKED_LINK_INVALID_LABEL",
    ],
    [
      "destino sem http",
      { ...GUIA, destinationUrl: "www.x.pt" },
      "TRACKED_LINK_INVALID_URL",
    ],
    [
      "destino javascript:",
      { ...GUIA, destinationUrl: "javascript:alert(1)" },
      "TRACKED_LINK_INVALID_URL",
    ],
  ])("recusa %s sem gravar", async (_name, body, code) => {
    const response = await post(body);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe(code);
    expect(mocks.saveTrackedLinksWithinPlan).not.toHaveBeenCalled();
  });

  it("não cria links noutra organização", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await post({ ...GUIA, orgId: 99 });

    expect(response.status).toBe(403);
    expect(mocks.saveTrackedLinksWithinPlan).not.toHaveBeenCalled();
  });
});
