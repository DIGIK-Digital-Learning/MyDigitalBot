// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOwnedOrg } from "@/lib/auth/guards";
import { runInactivityScan } from "@/lib/services/automations/inactivityScan";
import { POST } from "@/app/api/automations/run/inactivity/route";

vi.mock("@/lib/auth/guards", async (importOriginal) => ({
  ...(await importOriginal()),
  requireOwnedOrg: vi.fn(),
}));
vi.mock("@/lib/services/automations/inactivityScan", () => ({
  runInactivityScan: vi.fn(),
}));
/* A Demo terminada tem testes próprios (demoExpired); aqui, ativa. */
vi.mock("@/lib/services/plans/planLimits", () => ({
  checkPlanActive: async () => ({ orgLimits: null }),
}));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.jsx?$/.test(entry.name) ? [path] : [];
  });
}

beforeEach(() => vi.resetAllMocks());

describe("Execução manual de automações sem segredo público", () => {
  it("não inclui o segredo público dos crons em src", () => {
    const forbiddenName = ["NEXT_PUBLIC", "CRON_SECRET"].join("_");
    const matches = sourceFiles(resolve("src")).filter((path) =>
      readFileSync(path, "utf8").includes(forbiddenName),
    );
    expect(matches).toEqual([]);
  });

  it("não executa a inatividade quando a organização não é autorizada", async () => {
    requireOwnedOrg.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    const response = await POST({ json: async () => ({ organizationId: 2 }) });
    expect(response.status).toBe(403);
    expect(runInactivityScan).not.toHaveBeenCalled();
  });

  it("executa apenas para a organização devolvida pela autorização", async () => {
    requireOwnedOrg.mockResolvedValue({ orgId: 1 });
    runInactivityScan.mockResolvedValue({ ok: true });
    const response = await POST({ json: async () => ({ organizationId: 2, limit: 50 }) });
    expect(requireOwnedOrg).toHaveBeenCalledWith(2);
    expect(runInactivityScan).toHaveBeenCalledExactlyOnceWith({ organizationId: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
