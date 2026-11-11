import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/* A tradução devolve a chave e os parâmetros, para se ver o que foi pedido. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key, params) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

import FilePickerButton from "@/app/components/FilePickerButton/FilePickerButton";

const file = (name) => new File(["x"], name, { type: "text/csv" });

/*
 * #245: o botão nativo de ficheiros fica na língua do browser. Este usa o
 * texto da app e diz o que foi escolhido.
 */
describe("FilePickerButton", () => {
  it("um ficheiro: o input tem o nosso texto e o estado diz que nada foi escolhido", () => {
    render(<FilePickerButton id="f" />);

    const input = document.getElementById("f");
    expect(input).toHaveAttribute("type", "file");
    expect(input).not.toHaveAttribute("multiple");
    expect(input).toHaveAccessibleName("chooseFile");
    expect(screen.getByText("noFileChosen")).toBeInTheDocument();
  });

  it("vários: mostra o nome de um, ou quantos foram escolhidos", () => {
    const { rerender } = render(<FilePickerButton id="f" multiple />);
    expect(document.getElementById("f")).toHaveAccessibleName("chooseFiles");

    rerender(<FilePickerButton id="f" multiple files={[file("a.csv")]} />);
    expect(screen.getByText("a.csv")).toBeInTheDocument();

    rerender(
      <FilePickerButton id="f" multiple files={[file("a.csv"), file("b.csv")]} />,
    );
    expect(screen.getByText('filesChosen {"count":2}')).toBeInTheDocument();
  });

  it("escolher um ficheiro chega ao onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilePickerButton id="f" onChange={onChange} />);

    await user.upload(document.getElementById("f"), file("lista.csv"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.files[0].name).toBe("lista.csv");
  });

  it("desativado não deixa escolher; sem estado quando o ecrã já o mostra", () => {
    render(<FilePickerButton id="f" disabled showStatus={false} />);

    expect(document.getElementById("f")).toBeDisabled();
    expect(screen.queryByText("noFileChosen")).toBeNull();
  });
});
