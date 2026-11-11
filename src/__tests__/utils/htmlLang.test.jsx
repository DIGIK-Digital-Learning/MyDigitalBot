import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/*
 * #243: o `<html lang>` vinha do cookie NEXT_LOCALE (e "en" sem cookie).
 * Na primeira visita uma página em PT dizia que estava em inglês, e depois
 * de mudar de língua ficava a antiga até recarregar.
 */

const mocks = vi.hoisted(() => ({ locale: "pt" }));

vi.mock("next-intl", () => ({ useLocale: () => mocks.locale }));

import HtmlLang from "@/app/components/HtmlLang/HtmlLang";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("língua da página (<html lang>)", () => {
  it("o layout de topo usa a língua do pedido e não o cookie", () => {
    const layout = read("../../app/layout.js");
    expect(layout).toContain("await getLocale()");
    expect(layout).not.toContain('get("NEXT_LOCALE")');
  });

  it("acompanha a mudança de língua sem recarregar", () => {
    document.documentElement.lang = "en";
    const { rerender } = render(<HtmlLang />);
    expect(document.documentElement.lang).toBe("pt");

    mocks.locale = "en";
    rerender(<HtmlLang />);
    expect(document.documentElement.lang).toBe("en");
  });

  it("a página «não encontrada» usa a língua do pedido (/en/... em inglês)", () => {
    const notFound = read("../../app/not-found.jsx");
    expect(notFound).toContain("await getLocale()");
    expect(notFound).not.toContain("x-next-url");
  });

  it("está no layout de cada língua", () => {
    expect(read("../../app/[locale]/layout.js")).toContain("<HtmlLang />");
  });
});
