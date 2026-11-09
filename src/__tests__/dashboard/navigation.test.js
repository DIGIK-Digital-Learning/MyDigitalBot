// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth/safeRedirect";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

describe("authenticated navigation", () => {
  it("links Home and Settings to their canonical routes without gating them by isAdmin", () => {
    const navbar = read("../../app/components/Navbar/Navbar.jsx");
    expect(navbar).toContain('href="/dashboard"');
    expect(navbar).toContain('href="/settings"');
    expect(navbar).not.toContain('href="/admin"');
    expect(navbar).not.toContain('href="/options"');
  });

  it("keeps canonical and compatibility routes private", () => {
    const proxy = read("../../proxy.js");
    for (const route of ["dashboard", "settings", "admin", "options"]) {
      expect(proxy).toContain(`"${route}"`);
    }
  });

  /* A pasta options foi juntada às Definições (85a3863, 30/09/2026): só a
     página admin continua a redirecionar para /settings. */
  it("redirects the admin compatibility page to localized settings", () => {
    const admin = read("../../app/[locale]/(app)/admin/page.js");
    expect(admin).toContain('redirect({ href: "/settings", locale })');
    expect(exists("../../app/[locale]/(app)/options/page.js")).toBe(false);
  });

  /* O login já não redireciona no servidor: a ação devolve { success } e a
     página manda para `next` (se for seguro) ou, por omissão, para o
     dashboard da língua atual. */
  it("uses dashboard after login", () => {
    const actions = read("../../app/[locale]/(auth)/login/actions.js");
    const page = read("../../app/[locale]/(auth)/login/page.jsx");
    expect(DEFAULT_AUTH_REDIRECT).toBe("/dashboard");
    expect(actions).toContain("return { success: true }");
    expect(page).toContain("`/${locale}${DEFAULT_AUTH_REDIRECT}`");
    expect(page).not.toContain("/${locale}/users");
  });
});
