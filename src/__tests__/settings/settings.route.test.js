import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  saveOrganizationSettings: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  parsePositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  },
  requireOwnedOrg: mocks.requireOwnedOrg,
  handleApiError(error, fallback) {
    const status = error?.status || 500;
    return Response.json(
      { error: status >= 500 ? fallback : error.message },
      { status },
    );
  },
}));

vi.mock("@/lib/services/organizationSettings.service", () => ({
  loadOrganizationSettings: vi.fn(),
  saveOrganizationSettings: mocks.saveOrganizationSettings,
}));

import { PATCH } from "@/app/api/organizations/settings/route";
import { resolveAccess } from "@/lib/auth/permissions";

const ADMIN = resolveAccess({ isOwner: true });

function request(body) {
  return new Request("http://localhost/api/organizations/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/organizations/settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await PATCH(request({ orgId: 5, name: "Acme" }));
    expect(response.status).toBe(401);
    expect(mocks.saveOrganizationSettings).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-owner", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await PATCH(request({ orgId: 5, name: "Acme" }));
    expect(response.status).toBe(403);
    expect(mocks.saveOrganizationSettings).not.toHaveBeenCalled();
  });

  it("uses the organization id returned by the ownership guard", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7, access: ADMIN });
    mocks.saveOrganizationSettings.mockResolvedValue({ id: 7, name: "Acme" });

    const body = { orgId: 999, id: 123, owner_user_id: "attacker", name: "Acme" };
    const response = await PATCH(request(body));

    expect(response.status).toBe(200);
    expect(mocks.requireOwnedOrg).toHaveBeenCalledWith(999, { permission: "settings.organization" });
    expect(mocks.saveOrganizationSettings).toHaveBeenCalledWith(7, body);
  });

  it("returns 409 for a duplicate Teams tenant", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7, access: ADMIN });
    mocks.saveOrganizationSettings.mockRejectedValue(
      Object.assign(new Error("Tenant already used"), { status: 409 }),
    );

    const response = await PATCH(
      request({ orgId: 7, teams_tenant_id: "tenant-1" }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Tenant already used" });
  });

  it("#247: quem só edita a organização não muda as integrações", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      orgId: 7,
      access: resolveAccess({
        member: { typeKey: null, permissions: ["settings.organization"] },
      }),
    });

    const blocked = await PATCH(request({ orgId: 7, waba_id: "outro" }));
    expect(blocked.status).toBe(403);
    expect(mocks.saveOrganizationSettings).not.toHaveBeenCalled();

    mocks.saveOrganizationSettings.mockResolvedValue({ id: 7, name: "Acme" });
    const allowed = await PATCH(request({ orgId: 7, name: "Acme" }));
    expect(allowed.status).toBe(200);
  });
});
