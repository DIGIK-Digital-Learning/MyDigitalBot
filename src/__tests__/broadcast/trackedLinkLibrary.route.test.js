import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  listReusableTrackedLinks: vi.fn(),
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

import { GET } from "@/app/api/tracked-links/library/route";

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
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7 , user: { id: "owner-test" }, supabase: { from: vi.fn() } });
    mocks.listReusableTrackedLinks.mockResolvedValue(items);

    const response = await GET(request(7));

    expect(response.status).toBe(200);
    expect(mocks.requireOwnedOrg).toHaveBeenCalledWith(7);
    expect(mocks.listReusableTrackedLinks).toHaveBeenCalledWith(7);
    expect(await response.json()).toEqual({ items });
  });
});
