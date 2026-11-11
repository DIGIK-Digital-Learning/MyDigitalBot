import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RowAction, {
  RowActionLink,
  RowActions,
} from "@/app/components/RowAction/RowAction";
import { rowClickHandler } from "@/app/components/RowAction/rowClick";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/*
 * #238: um só aspeto e um só texto por função, e clicar na linha faz o mesmo
 * que o "Ver" dessa linha.
 */

function Row({ onOpen, onEdit }) {
  return (
    <table>
      <tbody>
        <tr data-testid="row" onClick={rowClickHandler(onOpen)}>
          <td>Ana</td>
          <td>
            <RowActions label="Ações">
              <RowAction kind="edit" label="Editar" onClick={onEdit} />
              <RowAction kind="delete" label="Eliminar" />
            </RowActions>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe("RowAction", () => {
  it("mostra o ícone e o texto, e «Eliminar» fica a vermelho", () => {
    render(<Row onOpen={() => {}} onEdit={() => {}} />);

    const edit = screen.getByRole("button", { name: "Editar" });
    const del = screen.getByRole("button", { name: "Eliminar" });

    expect(edit.querySelector("svg")).not.toBeNull();
    expect(edit.className).not.toMatch(/danger/);
    expect(del.className).toMatch(/danger/);
  });

  it("só o ícone continua a ter nome para leitores de ecrã", () => {
    render(<RowAction kind="delete" compact label="Eliminar link" />);
    const button = screen.getByRole("button", { name: "Eliminar link" });
    expect(button.getAttribute("title")).toBe("Eliminar link");
  });

  it("o link de «Ver» é um link verdadeiro, com o mesmo aspeto", () => {
    render(<RowActionLink href="/detalhe?id=1" label="Ver" />);
    const link = screen.getByRole("link", { name: "Ver" });
    expect(link.getAttribute("href")).toBe("/detalhe?id=1");
    expect(link.className).toMatch(/action/);
  });
});

describe("clicar na linha", () => {
  it("abre o «Ver»", () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} onEdit={() => {}} />);

    fireEvent.click(screen.getByText("Ana"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("um botão da linha não abre também o «Ver»", () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(<Row onOpen={onOpen} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("acabar de selecionar texto não abre nada", () => {
    const onOpen = vi.fn();
    render(<Row onOpen={onOpen} onEdit={() => {}} />);

    const spy = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "Ana" });
    fireEvent.click(screen.getByText("Ana"));
    spy.mockRestore();

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("textos e páginas (#238)", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const pt = JSON.parse(read("../../messages/pt.json"));
  const en = JSON.parse(read("../../messages/en.json"));

  it("deixa de haver «Apagar»: é sempre «Eliminar»", () => {
    expect(JSON.stringify(pt)).not.toMatch(/\bApagar\b/);
    expect(pt.Users.row.delete).toBe("Eliminar");
    expect(pt.Automations.rulesTable.delete).toBe("Eliminar");
  });

  it("criar começa por «Novo» e só a primeira letra é maiúscula", () => {
    expect(pt.Users.newUser).toBe("Novo utilizador");
    expect(pt.Assistants.createAssistant).toBe("Novo assistente");
    expect(en.Users.newUser).toBe("New user");
    expect(en.Assistants.createAssistant).toBe("New assistant");
  });

  it("limpar os filtros diz «Limpar filtros»", () => {
    expect(pt.Common.clearAll).toBe("Limpar filtros");
    expect(en.Common.clearAll).toBe("Clear filters");
  });

  it.each([
    "../../app/[locale]/(app)/users/page.jsx",
    "../../app/[locale]/(app)/broadcast/scheduled/components/ScheduledTable.jsx",
    "../../app/[locale]/(app)/automations/page.js",
    "../../app/[locale]/(app)/broadcast/media/page.jsx",
    "../../app/[locale]/(app)/assistants/page.jsx",
    "../../app/[locale]/(app)/broadcast/tracked-links/page.jsx",
    "../../app/[locale]/(app)/broadcast/tracked-links/components/SavedLinksSection.jsx",
  ])("%s usa as ações partilhadas", (path) => {
    expect(read(path)).toMatch(/<RowAction(Link)?\b/);
  });

  it.each([
    "../../app/[locale]/(app)/users/page.jsx",
    "../../app/[locale]/(app)/broadcast/scheduled/components/ScheduledTable.jsx",
    "../../app/[locale]/(app)/broadcast/tracked-links/page.jsx",
  ])("%s: clicar na linha faz o mesmo que «Ver»", (path) => {
    expect(read(path)).toContain("rowClickHandler(");
  });
});
