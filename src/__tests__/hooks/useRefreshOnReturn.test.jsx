import { readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import useRefreshOnReturn, { MIN_AWAY_MS } from "@/app/hooks/useRefreshOnReturn";

/*
 * #236: sem botões "Atualizar", os dados voltam a ser pedidos quando a
 * pessoa regressa ao separador da app depois de algum tempo fora.
 */

let visibility = "visible";

function setVisibility(next) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useRefreshOnReturn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("volta a pedir os dados depois de pelo menos 30 s noutro separador", () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnReturn(refresh));

    setVisibility("hidden");
    vi.advanceTimersByTime(MIN_AWAY_MS);
    setVisibility("visible");

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uma espreitadela rápida a outro separador não pede nada", () => {
    const refresh = vi.fn();
    renderHook(() => useRefreshOnReturn(refresh));

    setVisibility("hidden");
    vi.advanceTimersByTime(5_000);
    setVisibility("visible");

    expect(refresh).not.toHaveBeenCalled();
  });

  it("usa sempre a versão mais recente da função e deixa de escutar ao sair", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ fn }) => useRefreshOnReturn(fn),
      { initialProps: { fn: first } },
    );
    rerender({ fn: second });

    setVisibility("hidden");
    vi.advanceTimersByTime(MIN_AWAY_MS);
    setVisibility("visible");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unmount();
    setVisibility("hidden");
    vi.advanceTimersByTime(MIN_AWAY_MS);
    setVisibility("visible");
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("sem botões «Atualizar» (#236)", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

  it.each([
    "../../app/[locale]/(app)/analytics/page.js",
    "../../app/[locale]/(app)/automations/page.js",
    "../../app/[locale]/(app)/broadcast/scheduled/components/ScheduledFilters.jsx",
    "../../app/[locale]/(app)/settings/components/ActivityFilters.jsx",
    "../../app/[locale]/(app)/users/ViewUserModal.jsx",
  ])("%s não tem o botão", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/RefreshCw|RefreshCcw/);
    expect(source).not.toMatch(/\(\s*"(refresh|Refresh|reload)"\s*\)/);
  });

  it.each([
    "../../app/[locale]/(app)/analytics/page.js",
    "../../app/[locale]/(app)/automations/page.js",
    "../../app/[locale]/(app)/broadcast/scheduled/page.js",
    "../../app/[locale]/(app)/settings/components/ActivityLog.jsx",
  ])("%s atualiza sozinho ao voltar", (path) => {
    expect(read(path)).toContain("useRefreshOnReturn(");
  });
});
