// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), dataset: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: mocks.authorize,
  handleApiError(error, fallback) {
    const status = error.status ?? 500;
    return Response.json({ error: status >= 500 ? fallback : error.message }, { status });
  },
}));
vi.mock("@/lib/services/analytics/analyticsExport.service", () => ({
  getAnalyticsExportDataset: mocks.dataset,
}));
import { GET } from "@/app/api/analytics/export/route";
const request = (query = "orgId=99") => new Request("http://localhost/api/analytics/export?" + query);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ orgId: 7 , user: { id: "owner-test" }, supabase: { from: vi.fn() } });
  mocks.dataset.mockResolvedValue({ ok: true, messages: [] });
});

describe("analytics export authorization and errors", () => {
  it.each([400, 401, 403])("rejects an unauthorized request with %i before reading personal data", async (status) => {
    mocks.authorize.mockResolvedValue({ error: Response.json({ error: "Denied" }, { status }) });
    expect((await GET(request())).status).toBe(status);
    expect(mocks.dataset).not.toHaveBeenCalled();
  });
  it("uses the organization validated by the guard and the selected period", async () => {
    expect((await GET(request("orgId=99&period=30d"))).status).toBe(200);
    expect(mocks.dataset).toHaveBeenCalledWith({ orgId: 7, period: "30d" });
  });
  it("defaults to all periods", async () => {
    await GET(request());
    expect(mocks.dataset).toHaveBeenCalledWith({ orgId: 7, period: "all" });
  });
  it("returns an invalid-period error", async () => {
    mocks.dataset.mockRejectedValue(Object.assign(new Error("Invalid period"), { status: 400 }));
    expect((await GET(request("orgId=7&period=invalid"))).status).toBe(400);
  });
  it("does not expose database error details", async () => {
    mocks.dataset.mockRejectedValue(new Error("database private details"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to build analytics export" });
  });
});
