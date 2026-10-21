import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UsageCounter from "@/app/components/UsageCounter/UsageCounter";

/* Contador do limite do plano ("6 / 20"), #186. */
describe("UsageCounter", () => {
  it("mostra o gasto e o limite, com a dica ao passar o rato", () => {
    render(<UsageCounter used={6} limit={20} label="Automações" hint="Contam todas" />);

    const counter = screen.getByText("6 / 20");
    expect(counter).toHaveAttribute("title", "Contam todas");
    expect(counter).toHaveAttribute("aria-label", "Automações: 6 / 20");
  });

  it("fica vermelho no limite, porque já não cabe mais nenhum", () => {
    const { rerender } = render(<UsageCounter used={19} limit={20} />);
    expect(screen.getByText("19 / 20").className).not.toMatch(/full/);

    rerender(<UsageCounter used={20} limit={20} />);
    expect(screen.getByText("20 / 20").className).toMatch(/full/);
  });

  it("sem limite no plano, ou sem números ainda, não mostra nada", () => {
    const { container, rerender } = render(<UsageCounter used={6} limit={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<UsageCounter used={null} limit={20} />);
    expect(container).toBeEmptyDOMElement();
  });
});
