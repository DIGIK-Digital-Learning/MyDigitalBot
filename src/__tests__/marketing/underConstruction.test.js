// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/utils/supabase/middleware", () => ({
  updateSession: async (request) => ({
    response: NextResponse.next({ request }),
    user: null,
  }),
}));
// O middleware do next-intl não carrega no vitest (importa "next/server" sem extensão).
vi.mock("next-intl/middleware", () => ({
  default: () => () => NextResponse.next(),
}));

const { proxy } = await import("@/proxy");

const visit = (path) => proxy(new NextRequest(`http://localhost${path}`));
const location = (response) =>
  new URL(response.headers.get("location")).pathname;

afterEach(() => {
  delete process.env.MAINTENANCE_MODE;
});

/* Com MAINTENANCE_MODE=true o marketing vai para a «Em construção»; o login,
   a /legal e os links rastreados continuam a abrir. */
describe("site em construção", () => {
  it("manda as páginas de marketing para a Em construção, na mesma língua", async () => {
    process.env.MAINTENANCE_MODE = "true";

    for (const [path, target] of [
      ["/", "/under-construction"],
      ["/pricing", "/under-construction"],
      ["/en/product", "/en/under-construction"],
    ]) {
      const response = await visit(path);
      expect(response.status).toBe(307);
      expect(location(response)).toBe(target);
    }
  });

  it("deixa o login, a legal e os links rastreados em paz", async () => {
    process.env.MAINTENANCE_MODE = "true";

    for (const path of ["/login", "/en/login", "/legal", "/r/abc123"]) {
      const response = await visit(path);
      expect(response.headers.get("location") ?? "").not.toContain(
        "under-construction",
      );
    }
  });

  it("sem manutenção, a Em construção volta para a página inicial", async () => {
    const response = await visit("/en/under-construction");
    expect(response.status).toBe(307);
    expect(location(response)).toBe("/en");
  });
});
