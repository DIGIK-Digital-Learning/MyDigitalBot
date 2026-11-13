import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SETTINGS_SECTIONS,
  hrefFromLegacyTab,
} from "@/app/[locale]/(app)/settings/helpers/settingsSections";

/*
 * As Definições dividem-se em três páginas, com submenu na barra lateral
 * como as Mensagens: Organização, Integrações e Histórico de atividade.
 * Antes eram separadores na mesma página (#239), com ?tab=… no endereço.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));
const SETTINGS = "../../app/[locale]/(app)/settings";

describe("páginas das Definições", () => {
  it("são três, cada uma com o seu endereço", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.href)).toEqual([
      "/settings",
      "/settings/integrations",
      "/settings/activity",
    ]);
    expect(exists(`${SETTINGS}/page.jsx`)).toBe(true);
    expect(exists(`${SETTINGS}/integrations/page.jsx`)).toBe(true);
    expect(exists(`${SETTINGS}/activity/page.jsx`)).toBe(true);
  });

  it("cada página mostra a sua secção", () => {
    expect(read(`${SETTINGS}/page.jsx`)).toContain(
      '<SettingsView section="organization" />',
    );
    expect(read(`${SETTINGS}/integrations/page.jsx`)).toContain(
      '<SettingsView section="integrations" />',
    );
    expect(read(`${SETTINGS}/activity/page.jsx`)).toContain(
      '<SettingsView section="activity" />',
    );
  });

  it("os links antigos com ?tab=… levam à página nova", () => {
    expect(hrefFromLegacyTab("integracoes")).toBe("/settings/integrations");
    expect(hrefFromLegacyTab("historico")).toBe("/settings/activity");
    expect(hrefFromLegacyTab("organizacao")).toBeNull();
    expect(hrefFromLegacyTab(undefined)).toBeNull();
    expect(read(`${SETTINGS}/page.jsx`)).toContain(
      "redirect({ href: legacyHref",
    );
  });

  it("já não há separadores na página", () => {
    const view = read(`${SETTINGS}/SettingsView.jsx`);
    expect(view).not.toContain("PageTabs");
    expect(view).not.toContain("searchParams");
  });

  it("a mensagem de abertura fica nas Integrações", () => {
    const view = read(`${SETTINGS}/SettingsView.jsx`);
    const integrations = view.slice(view.indexOf('section === "integrations"'));
    expect(integrations.indexOf("<OpeningMessageSettings")).toBeLessThan(
      integrations.indexOf('section === "activity"'),
    );
  });

  it("ocupa a largura toda, como as outras páginas", () => {
    expect(read(`${SETTINGS}/settings.module.css`)).not.toMatch(/min\(1100px/);
  });
});

describe("submenu das Definições na barra lateral", () => {
  const navbar = read("../../app/components/Navbar/Navbar.jsx");

  it("tem as três páginas, como o submenu das Mensagens", () => {
    expect(navbar).toContain('aria-controls="settings-subnav"');
    for (const href of [
      "/settings",
      "/settings/integrations",
      "/settings/activity",
    ]) {
      expect(navbar).toContain(`href="${href}"`);
    }
  });

  it("a Organização só fica marcada na própria página", () => {
    expect(navbar).toContain('isExactActive("/settings")');
  });

  it("tem os nomes em PT e EN", () => {
    const pt = JSON.parse(read("../../messages/pt.json"));
    const en = JSON.parse(read("../../messages/en.json"));
    expect(pt.Settings.tabs).toEqual({
      organization: "Organização",
      integrations: "Integrações",
      activity: "Histórico de atividade",
    });
    expect(en.Settings.tabs).toEqual({
      organization: "Organization",
      integrations: "Integrations",
      activity: "Activity history",
    });
  });
});
