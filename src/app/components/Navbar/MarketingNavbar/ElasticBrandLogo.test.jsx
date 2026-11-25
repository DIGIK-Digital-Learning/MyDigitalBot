import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ElasticBrandLogo from "./ElasticBrandLogo";

function mockMediaQueries({ reducedMotion = false, finePointer = true } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: query.includes("prefers-reduced-motion")
        ? reducedMotion
        : finePointer,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("ElasticBrandLogo", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the logo static when reduced motion is requested", () => {
    mockMediaQueries({ reducedMotion: true });
    const { container } = render(<ElasticBrandLogo />);
    const hitArea = container.querySelector("span[aria-hidden='true']:last-child");
    // O símbolo é o único SVG (o texto é HTML); a zona de toque é o último span.
    const symbol = container.querySelector("svg");

    fireEvent.pointerMove(hitArea, {
      pointerType: "mouse",
      clientX: 20,
      clientY: 10,
    });
    fireEvent.pointerDown(hitArea, { pointerType: "touch" });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(symbol.style.transform).toBe("");
  });

  it("does not track touch movement but allows a brief press response", () => {
    mockMediaQueries();
    const { container } = render(<ElasticBrandLogo />);
    const hitArea = container.querySelector("span[aria-hidden='true']:last-child");

    fireEvent.pointerMove(hitArea, {
      pointerType: "touch",
      clientX: 20,
      clientY: 10,
    });
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    fireEvent.pointerDown(hitArea, { pointerType: "touch" });
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
