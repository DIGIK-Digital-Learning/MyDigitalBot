import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";

/*
 * Etiqueta "Novo" nos links criados e nas agendadas criados desde a última
 * visita à página, e a secção "Links criados" na página dos links.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useLocale: () => "pt",
}));

import useSeenSince from "@/app/hooks/useSeenSince";
import SavedLinksSection from "@/app/[locale]/(app)/broadcast/tracked-links/components/SavedLinksSection";

const KEY = "seen.trackedLinks:7";

beforeEach(() => {
  /* Relógio controlado: cada teste fecha as visitas que abriu (afterEach). */
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useSeenSince", () => {
  it("na primeira visita nada é novo", () => {
    const { result } = renderHook(() => useSeenSince("seen.trackedLinks", 7));

    expect(result.current("2026-10-26T10:00:00Z")).toBe(false);
  });

  it("é novo o que foi criado depois da última visita", () => {
    window.localStorage.setItem(KEY, "2026-10-25T10:00:00.000Z");

    const { result } = renderHook(() => useSeenSince("seen.trackedLinks", 7));

    expect(result.current("2026-10-26T10:00:00Z")).toBe(true);
    expect(result.current("2026-10-24T10:00:00Z")).toBe(false);
    expect(result.current(null)).toBe(false);
  });

  it("a hora da visita só é gravada ao sair da página", () => {
    window.localStorage.setItem(KEY, "2026-10-25T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));

    const { result, unmount } = renderHook(() =>
      useSeenSince("seen.trackedLinks", 7),
    );

    /* Enquanto está na página, os "Novo" continuam. */
    expect(window.localStorage.getItem(KEY)).toBe("2026-10-25T10:00:00.000Z");
    expect(result.current("2026-10-26T10:00:00Z")).toBe(true);

    unmount();
    /* Só conta como saída se a página não voltar a montar logo a seguir. */
    expect(window.localStorage.getItem(KEY)).toBe("2026-10-25T10:00:00.000Z");

    vi.advanceTimersByTime(2000);
    /* Gravada a hora da saída (1,5 s depois de desmontar). */
    expect(window.localStorage.getItem(KEY)).toBe("2026-10-26T12:00:01.500Z");
  });

  it("montar outra vez logo a seguir continua a mesma visita (os Novo não se perdem)", () => {
    window.localStorage.setItem(KEY, "2026-10-25T10:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));

    const first = renderHook(() => useSeenSince("seen.trackedLinks", 7));
    first.unmount();

    vi.advanceTimersByTime(300);
    const second = renderHook(() => useSeenSince("seen.trackedLinks", 7));

    expect(second.result.current("2026-10-26T10:00:00Z")).toBe(true);

    second.unmount();
    vi.advanceTimersByTime(2000);
  });

  it("cada organização tem a sua visita", () => {
    window.localStorage.setItem(
      "seen.trackedLinks:8",
      "2026-10-25T10:00:00.000Z",
    );

    const { result } = renderHook(() => useSeenSince("seen.trackedLinks", 7));

    expect(result.current("2026-10-26T10:00:00Z")).toBe(false);
  });
});

function link(n, createdAt = "2026-10-01T10:00:00Z") {
  return {
    id: `l${n}`,
    label: `Recurso ${n}`,
    destinationUrl: `https://ex.pt/${n}`,
    createdAt,
  };
}

describe("SavedLinksSection", () => {
  it("mostra Novo só nos criados desde a última visita e elimina pelo ✕", () => {
    const onDelete = vi.fn();
    const links = [link(1, "2026-10-26T10:00:00Z"), link(2)];

    render(
      <SavedLinksSection
        links={links}
        loading={false}
        isNew={(date) => date > "2026-10-25"}
        onDelete={onDelete}
      />,
    );

    expect(screen.getAllByText("Common.new")).toHaveLength(1);
    expect(screen.getByText("Recurso 1").textContent).toContain("Common.new");

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Broadcast.linkLibrary.delete",
      })[1],
    );
    expect(onDelete).toHaveBeenCalledWith(links[1]);
  });

  it("8 por página, com a paginação só quando passa disso", () => {
    const links = Array.from({ length: 10 }, (_, i) => link(i + 1));

    render(
      <SavedLinksSection
        links={links}
        loading={false}
        isNew={() => false}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("sem links mostra o aviso de lista vazia", () => {
    render(
      <SavedLinksSection
        links={[]}
        loading={false}
        isNew={() => false}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("TrackedLinks.saved.empty")).toBeTruthy();
  });
});
