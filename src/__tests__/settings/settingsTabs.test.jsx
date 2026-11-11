import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PageTabs from "@/app/components/PageTabs/PageTabs";
import {
  DEFAULT_TAB,
  SETTINGS_TABS,
  tabFromParam,
} from "@/app/[locale]/(app)/settings/helpers/settingsTabs";

/*
 * #239: as Definições dividem-se em separadores (Organização, Integrações,
 * Histórico de atividade), com o separador aberto no endereço.
 */

const TABS = [
  { id: "organizacao", label: "Organização" },
  { id: "integracoes", label: "Integrações" },
  { id: "historico", label: "Histórico de atividade" },
];

describe("separador no endereço", () => {
  it("sem ?tab, ou com um valor desconhecido, abre a Organização", () => {
    expect(DEFAULT_TAB).toBe("organizacao");
    expect(tabFromParam(null)).toBe("organizacao");
    expect(tabFromParam("qualquer")).toBe("organizacao");
  });

  it("aceita os três separadores", () => {
    expect(SETTINGS_TABS).toEqual(["organizacao", "integracoes", "historico"]);
    expect(tabFromParam("historico")).toBe("historico");
  });
});

describe("PageTabs", () => {
  it("marca o separador aberto e avisa qual se escolheu", () => {
    const onChange = vi.fn();
    render(
      <PageTabs
        tabs={TABS}
        active="organizacao"
        onChange={onChange}
        label="Secções"
        idPrefix="t"
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Histórico de atividade" }));
    expect(onChange).toHaveBeenCalledWith("historico");
  });

  it("muda com as setas do teclado", () => {
    const onChange = vi.fn();
    render(
      <PageTabs
        tabs={TABS}
        active="organizacao"
        onChange={onChange}
        label="Secções"
        idPrefix="t"
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("integracoes");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("historico");
  });
});

describe("página das Definições (#239)", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const page = read("../../app/[locale]/(app)/settings/page.jsx");
  const css = read("../../app/[locale]/(app)/settings/settings.module.css");
  const pt = JSON.parse(read("../../messages/pt.json"));
  const en = JSON.parse(read("../../messages/en.json"));

  it("usa os separadores e guarda o separador no endereço", () => {
    expect(page).toContain("<PageTabs");
    expect(page).toContain('searchParams.get("tab")');
  });

  it("o Histórico só aparece no seu separador", () => {
    expect(page).toMatch(/tab === "historico" \? \(\s*<TabPanel/);
  });

  it("a mensagem de abertura fica nas Integrações", () => {
    const integrations = page.slice(page.indexOf('tab === "integracoes"'));
    expect(integrations.indexOf("<OpeningMessageSettings")).toBeLessThan(
      integrations.indexOf('tab === "historico"'),
    );
  });

  it("ocupa a largura toda, como as outras páginas", () => {
    expect(css).not.toMatch(/min\(1100px/);
  });

  it("tem os nomes dos separadores em PT e EN", () => {
    expect(pt.Settings.tabs.activity).toBe("Histórico de atividade");
    expect(en.Settings.tabs.activity).toBe("Activity history");
  });
});
