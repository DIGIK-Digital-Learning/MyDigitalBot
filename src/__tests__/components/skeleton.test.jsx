import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkeletonPage, SkeletonTable } from "@/app/components/Skeleton/Skeleton";

/*
 * #272: os carregamentos da app usam o mesmo skeleton, que os leitores de
 * ecrã anunciam uma só vez como "a carregar".
 */
describe("Skeleton", () => {
  it("anuncia a tabela a carregar e desenha o cabeçalho e as linhas pedidas", () => {
    const { container } = render(
      <SkeletonTable rows={3} columns={4} label="A carregar links" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("A carregar links");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    // Cabeçalho + 3 linhas; a primeira coluna tem duas barras (nome e detalhe).
    expect(container.querySelectorAll("[style] > div")).toHaveLength(4);
    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(
      4 + 3 * 5,
    );
  });

  it("a página inteira tem um só estado de carregamento, com o texto comum", () => {
    render(<SkeletonPage stats={2} columns={3} rows={2} />);

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("loading");
  });
});
