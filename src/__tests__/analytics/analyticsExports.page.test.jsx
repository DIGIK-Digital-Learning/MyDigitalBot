import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), excel: vi.fn(), stopLoading: vi.fn(), fetch: vi.fn() }));
vi.mock("next-intl", () => {
  const translate = (key) => key;
  return { useLocale: () => "pt", useTranslations: () => translate };
});
vi.mock("@/app/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" }, loading: false }) }));
vi.mock("@/app/hooks/useOrganization", () => ({ default: () => ({ org: { id: 7, name: "Test" }, loading: false }) }));
vi.mock("@/app/LoadingScreen/GlobalLoaderContext", () => ({ useGlobalLoader: () => ({ stopLoading: mocks.stopLoading }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/app/[locale]/(app)/analytics/lib/analytics.export", () => ({ exportAnalyticsPdf: mocks.pdf }));
vi.mock("@/app/[locale]/(app)/analytics/lib/analytics.excel", () => ({ exportAnalyticsExcel: mocks.excel }));

import AnalyticsPage from "@/app/[locale]/(app)/analytics/page";
const metrics = { ok: true, period: { value: "all" }, users: { total: 25 }, daily: { messages: [{ date: "2026-09-30", messages: 1 }] } };
beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async (url) => ({ ok: true, json: async () => url.includes("overview") ? metrics : { ok: true, messages: [] } }));
});

async function ready() {
  render(<AnalyticsPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "customization.exportExcel" })).toBeEnabled());
}

describe("exports in the current staging dashboard", () => {
  it("passes the current metrics, translated labels and detail to Excel", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "customization.exportExcel" }));
    await waitFor(() => expect(mocks.excel).toHaveBeenCalled());
    expect(mocks.fetch).toHaveBeenCalledWith("/api/analytics/export?orgId=7&period=all", { cache: "no-store" });
    expect(mocks.excel.mock.calls[0][0]).toMatchObject({ data: { users: { total: 25 } }, detail: { daily: metrics.daily }, meta: { organizationName: "Test" } });
  });
  it("downloads the summary and warns if the detail endpoint fails", async () => {
    await ready();
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Unavailable" }) });
    fireEvent.click(screen.getByRole("button", { name: "customization.exportExcel" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("errors.exportPartial"));
    expect(mocks.excel.mock.calls[0][0].detail).toBeNull();
  });
  it("reports generation failure and restores the buttons", async () => {
    await ready();
    mocks.excel.mockRejectedValue(new Error("Generation failed"));
    fireEvent.click(screen.getByRole("button", { name: "customization.exportExcel" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("errors.export"));
    expect(screen.getByRole("button", { name: "customization.exportPdf" })).toBeEnabled();
  });
  it("locks export and period controls until PDF generation finishes", async () => {
    let finish;
    mocks.pdf.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "customization.exportPdf" }));
    expect(screen.getByRole("button", { name: "customization.exportExcel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "periods.last7Days" })).toBeDisabled();
    expect(mocks.pdf.mock.calls[0][0].exportElement).toHaveAttribute("data-analytics-pdf-root", "true");
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "customization.exportPdf" })).toBeEnabled());
  });
  it("excludes collapsed sections from PDF capture", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "customization.hide" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "customization.exportPdf" }));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalled());
    const root = mocks.pdf.mock.calls[0][0].exportElement;
    expect(root.querySelector("section")).not.toHaveAttribute("data-pdf-section");
    expect(root.querySelectorAll("section[data-pdf-section]")).toHaveLength(7);
  });
  /*
   * O html2canvas não desenha o que tem data-html2canvas-ignore. Uma secção
   * do PDF que só tenha isso sai com 0 px de altura e o jsPDF rebenta
   * («wrong PNG signature»). Foi o que aconteceu ao cabeçalho a 28/10, quando
   * ficou só com os botões.
   */
  it("every PDF section keeps something html2canvas will draw", async () => {
    await ready();
    const root = document.querySelector('[data-analytics-pdf-root="true"]');
    const sections = [...root.querySelectorAll("[data-pdf-section]")]
      .filter((section) => !section.parentElement?.closest("[data-pdf-section]"));
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      const printable = section.cloneNode(true);
      printable.querySelectorAll("[data-html2canvas-ignore]").forEach((node) => node.remove());
      const drawsSomething = printable.textContent.trim() !== "" || printable.querySelector("svg, canvas, img");
      expect(drawsSomething, section.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });
});
