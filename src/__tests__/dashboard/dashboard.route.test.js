import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnedOrg: vi.fn(),
  getDashboardOverview: vi.fn(),
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

vi.mock("@/lib/services/dashboard/dashboard.service", () => ({
  getDashboardOverview: mocks.getDashboardOverview,
}));

import { GET } from "@/app/api/dashboard/overview/route";

const request = (orgId) => ({
  nextUrl: new URL(`http://localhost/api/dashboard/overview?orgId=${orgId}`),
});

describe("GET /api/dashboard/overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not expose metrics to a non-owner", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(request(99));
    expect(response.status).toBe(403);
    expect(mocks.getDashboardOverview).not.toHaveBeenCalled();
  });

  it("queries metrics with the guarded organization id", async () => {
    mocks.requireOwnedOrg.mockResolvedValue({ orgId: 7, user: { id: "owner-test" }, supabase: { from: vi.fn() } });
    mocks.getDashboardOverview.mockResolvedValue({ users: { total: 0 } });

    const response = await GET(request(99));
    expect(response.status).toBe(200);
    expect(mocks.requireOwnedOrg).toHaveBeenCalledWith(99);
    expect(mocks.getDashboardOverview).toHaveBeenCalledWith(7);
  });
});
