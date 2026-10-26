import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";

/*
 * Etiqueta "Novo" nos links guardados e nas agendadas criados desde a última
 * visita à página, e a secção "Links guardados" na página dos links.
 */

const mocks = vi.hoisted(() => ({
  library: {
    items: [],
    loading: false,
    failed: false,
    reload: vi.fn(),
  },
  deleteLink: vi.fn(),
  reloadPlanUsage: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
  useLocale: () => "pt",
}));

vi.mock("@/app/[locale]/(app)/broadcast/hooks/useTrackedLinkLibrary", () => ({
  default: () => mocks.library,
}));

vi.mock("@/app/[locale]/(app)/broadcast/hooks/useDeleteTrackedLink", () => ({
  default:
    (orgId, { onDeleted }) =>
    (item) =>
      mocks.deleteLink(orgId, item, onDeleted),
}));

vi.mock("@/app/hooks/usePlanLimits", () => ({
  default: () => ({
    limits: { trackedLinks: 100 },
    usage: { trackedLinks: 2 },
    reload: mocks.reloadPlanUsage,
  }),
}));

import useSeenSince from "@/app/hooks/useSeenSince";
import SavedLinksSection from "@/app/[locale]/(app)/broadcast/tracked-links/components/SavedLinksSection";

const KEY = "seen.trackedLinks:7";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.library.items = [];
});

afterEach(() => {
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

    expect(window.localStorage.getItem(KEY)).toBe("2026-10-26T12:00:00.000Z");
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

describe("Links guardados na página dos links", () => {
  const LINKS = [
    {
      id: "a",
      label: "Manual",
      destinationUrl: "https://ex.pt/manual",
      createdAt: "2026-10-26T10:00:00Z",
    },
    {
      id: "b",
      label: "Guia",
      destinationUrl: "https://ex.pt/guia",
      createdAt: "2026-10-01T10:00:00Z",
    },
  ];

  it("mostra os links, o contador e o Novo só nos criados desde a última visita", () => {
    window.localStorage.setItem(KEY, "2026-10-25T10:00:00.000Z");
    mocks.library.items = LINKS;

    render(<SavedLinksSection orgId={7} />);

    expect(screen.getByText("2 / 100")).toBeInTheDocument();
    expect(screen.getAllByText("Common.new")).toHaveLength(1);
    expect(screen.getByText("Manual").closest("strong")).toHaveTextContent(
      "Common.new",
    );
  });

  it("o ✕ elimina com as regras do composer e atualiza a lista e o contador", () => {
    mocks.library.items = LINKS;

    render(<SavedLinksSection orgId={7} />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Broadcast.linkLibrary.delete",
      })[1],
    );

    expect(mocks.deleteLink).toHaveBeenCalledWith(
      7,
      LINKS[1],
      expect.any(Function),
    );

    act(() => mocks.deleteLink.mock.calls[0][2]());
    expect(mocks.library.reload).toHaveBeenCalled();
    expect(mocks.reloadPlanUsage).toHaveBeenCalled();
  });

  it("sem links, explica quando aparecem", () => {
    render(<SavedLinksSection orgId={7} />);

    expect(screen.getByText("TrackedLinks.saved.empty")).toBeInTheDocument();
  });
});
