import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  getBody: vi.fn(),
  updateBody: vi.fn(),
}));

vi.mock("@/lib/auth/guards", async () => {
  const actual = await vi.importActual("@/lib/auth/guards");
  return {
    ...actual,
    requireOwnedOrg: (...args) => mocks.requireOwnedOrg(...args),
  };
});

vi.mock("@/lib/repos/organizations.repo", () => ({
  getOrganizationOpeningBody: (...args) => mocks.getBody(...args),
  updateOrganizationOpeningBody: (...args) => mocks.updateBody(...args),
}));

import { GET, PUT } from "@/app/api/organizations/opening-message/route";
import { DEFAULT_OPENING_BODY } from "@/lib/whatsapp/openingTemplate";

function getRequest(query) {
  return {
    nextUrl: new URL(`http://localhost/api/organizations/opening-message${query}`),
  };
}

function putRequest(body) {
  return { json: () => Promise.resolve(body) };
}

describe("opening-message route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7, admin: {} , user: { id: "owner-test" }, supabase: { from: vi.fn() } });
  });

  it("GET returns the default body when the organization has none", async () => {
    mocks.getBody.mockResolvedValue(null);

    const res = await GET(getRequest("?orgId=7"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.item.body).toBe(DEFAULT_OPENING_BODY);
    expect(json.item.isDefault).toBe(true);
    expect(json.item.intro).toContain("{{nome}}");
    expect(mocks.getBody).toHaveBeenCalledWith(7);
  });

  it("GET rejects a missing orgId", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(400);
  });

  it("PUT saves a cleaned body", async () => {
    mocks.updateBody.mockResolvedValue("Novo corpo da mensagem");

    const res = await PUT(
      putRequest({ orgId: 7, body: "  Novo corpo\n\nda   mensagem " }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.updateBody).toHaveBeenCalledWith(
      7,
      "Novo corpo da mensagem",
    );
    expect(json.item.body).toBe("Novo corpo da mensagem");
    expect(json.item.isDefault).toBe(false);
  });

  it("PUT rejects an empty body", async () => {
    const res = await PUT(putRequest({ orgId: 7, body: "   " }));
    expect(res.status).toBe(400);
    expect(mocks.updateBody).not.toHaveBeenCalled();
  });

  it("PUT rejects a body over the limit", async () => {
    const res = await PUT(putRequest({ orgId: 7, body: "x".repeat(601) }));
    expect(res.status).toBe(400);
    expect(mocks.updateBody).not.toHaveBeenCalled();
  });

  it("PUT returns the auth error when the user does not own the org", async () => {
    const denied = new Response(null, { status: 403 });
    mocks.requireOwnedOrg.mockResolvedValue({ error: denied });

    const res = await PUT(putRequest({ orgId: 7, body: "ok" }));
    expect(res).toBe(denied);
  });
});
