import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Testa o exportAnalyticsPdf com o html2canvas e o jsPDF falsos. O jsPDF
 * falso rebenta com "data:," como o verdadeiro: é o que um canvas com 0 px
 * devolve em toDataURL.
 */
const mocks = vi.hoisted(() => ({ html2canvas: vi.fn(), addImage: vi.fn(), save: vi.fn() }));

vi.mock("html2canvas", () => ({ default: mocks.html2canvas }));
vi.mock("jspdf", () => ({
  default: class {
    constructor() {
      this.internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getCurrentPageInfo: () => ({ pageNumber: 1 }),
      };
    }
    addImage(...args) {
      if (args[0] === "data:,") throw new Error("wrong PNG signature");
      mocks.addImage(...args);
    }
    addPage() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    text() {}
    save(name) {
      mocks.save(name);
    }
  },
}));

import { exportAnalyticsPdf } from "@/app/[locale]/(app)/analytics/lib/analytics.export";

function canvas(width, height) {
  return {
    width,
    height,
    toDataURL: () => (width && height ? `data:image/png;base64,${width}x${height}` : "data:,"),
  };
}

function section(root, { empty = false } = {}) {
  const element = document.createElement("section");
  element.setAttribute("data-pdf-section", "");
  if (empty) element.dataset.empty = "true";
  element.getBoundingClientRect = () => ({ width: 940, height: empty ? 36 : 260 });
  root.appendChild(element);
  return element;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 0));
  mocks.html2canvas.mockImplementation(async (element) =>
    element.dataset.empty ? canvas(956, 0) : canvas(900, 300),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("exportAnalyticsPdf", () => {
  it("skips a section that renders empty and still saves the PDF", async () => {
    const root = document.createElement("main");
    document.body.appendChild(root);
    section(root, { empty: true });
    section(root);
    section(root);

    await exportAnalyticsPdf({ exportElement: root, period: "all" });

    expect(mocks.html2canvas).toHaveBeenCalledTimes(3);
    expect(mocks.addImage).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledWith(expect.stringMatching(/^analytics-all-\d{4}-\d{2}-\d{2}\.pdf$/));
  });

  it("adds every section that has content", async () => {
    const root = document.createElement("main");
    document.body.appendChild(root);
    section(root);
    section(root);

    await exportAnalyticsPdf({ exportElement: root, period: "last7Days" });

    expect(mocks.addImage).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
});
