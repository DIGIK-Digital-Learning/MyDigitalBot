import { beforeEach, describe, expect, it, vi } from "vitest";

/* «Ver como» (#247): a rota que guarda e lê o tipo escolhido. */

const mocks = vi.hoisted(() => ({ requireOwnedOrg: vi.fn() }));

vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal()),
  requireOwnedOrg: mocks.requireOwnedOrg,
}));
vi.mock("@/utils/supabase/server", () => ({ default: vi.fn() }));
vi.mock("@/lib/db/admin", () => ({ getSupabaseAdminClient: vi.fn() }));

import { GET, POST } from "@/app/api/organizations/view-as/route";
import { resolveAccess } from "@/lib/auth/permissions";

const ADMIN = resolveAccess({ isOwner: true });
const VIEWER = resolveAccess({
  member: { typeKey: "viewer", permissions: ["analytics.view"] },
});

const post = (body) => ({ json: async () => body });
const get = (orgId) => ({
  nextUrl: new URL(`http://x/api/organizations/view-as?orgId=${orgId}`),
});

beforeEach(() => vi.clearAllMocks());

describe("POST /api/organizations/view-as", () => {
  it("decide pelo tipo verdadeiro e só para Administradores", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, realAccess: ADMIN });

    await POST(post({ orgId: 1, typeKey: "viewer" }));

    expect(mocks.requireOwnedOrg).toHaveBeenCalledWith(1, {
      permission: "__admin_only__",
      realAccess: true,
    });
  });

  it("guarda o tipo num cookie só do servidor", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, realAccess: ADMIN });

    const response = await POST(post({ orgId: 1, typeKey: "viewer" }));
    const cookie = response.headers.get("set-cookie");

    expect(response.status).toBe(200);
    expect(cookie).toContain("mdb_view_as=viewer");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("voltar a Administrador apaga o cookie", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, realAccess: ADMIN });

    const response = await POST(post({ orgId: 1, typeKey: null }));

    expect(response.headers.get("set-cookie")).toMatch(/mdb_view_as=;/);
  });

  it("não aceita ver como Administrador nem um tipo inventado", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 1, realAccess: ADMIN });

    expect((await POST(post({ orgId: 1, typeKey: "admin" }))).status).toBe(400);
    expect((await POST(post({ orgId: 1, typeKey: "dono" }))).status).toBe(400);
  });

  it("quem não é Administrador recebe o 403 do guard", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await POST(post({ orgId: 1, typeKey: "viewer" }))).status).toBe(403);
  });
});

describe("GET /api/organizations/view-as", () => {
  it("o Administrador a ver como Leitor pode trocar e sabe como está", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      orgId: 1,
      realAccess: ADMIN,
      access: { ...VIEWER, viewingAs: "viewer" },
    });

    const body = await (await GET(get(1))).json();

    expect(body).toEqual({
      canSwitch: true,
      viewAs: "viewer",
      types: ["editor", "viewer"],
    });
  });

  it("um Leitor de verdade não vê o seletor", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      orgId: 1,
      realAccess: VIEWER,
      access: VIEWER,
    });

    expect(await (await GET(get(1))).json()).toEqual({
      canSwitch: false,
      viewAs: null,
      types: [],
    });
  });
});
