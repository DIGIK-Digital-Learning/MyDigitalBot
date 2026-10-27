import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

/*
 * Correntes na tabela das Mensagens agendadas: etiqueta "Corrente · N
 * mensagens", as mensagens ao abrir, sem editar, e o botão para cancelar
 * (agendada) ou parar (a decorrer).
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

import ScheduledTable from "@/app/[locale]/(app)/broadcast/scheduled/components/ScheduledTable";
import ChainStepEditModal from "@/app/[locale]/(app)/broadcast/scheduled/components/ChainStepEditModal";
import {
  canCloseChain,
  canDeleteItem,
  canEditItem,
  normalizeChain,
} from "@/app/[locale]/(app)/broadcast/scheduled/helpers/scheduled.helpers";

const t = (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key);

function chainItem(status = "scheduled") {
  return normalizeChain({
    id: "c1",
    channel: "whatsapp",
    status,
    scheduledFor: "2026-10-28T09:00:00Z",
    createdAt: "2026-10-27T10:00:00Z",
    recipientCount: 4,
    recipientsDone: 1,
    stepCount: 2,
    preview: "Bem-vindo",
    steps: [
      { index: 1, preview: "Bem-vindo", fileCount: 0, reached: 4 },
      { index: 2, preview: "", fileCount: 2, delayMinutes: 30, reached: 1 },
    ],
  });
}

function renderTable(item, props = {}) {
  return render(
    <ScheduledTable
      loading={false}
      translation={t}
      filteredItems={[item]}
      openViewModal={vi.fn()}
      openEditModal={vi.fn()}
      canEditItem={canEditItem}
      handleDelete={vi.fn()}
      canDeleteItem={canDeleteItem}
      deletingId={null}
      {...props}
    />,
  );
}

describe("correntes nas agendadas", () => {
  it("uma corrente não se edita nem se elimina como uma agendada", () => {
    const item = chainItem();

    expect(canEditItem(item)).toBe(false);
    expect(canDeleteItem(item)).toBe(false);
    expect(canCloseChain(item)).toBe(true);
    expect(canCloseChain(chainItem("sending"))).toBe(false);
  });

  it("mostra a etiqueta e abre as mensagens na tabela", () => {
    const onToggleChain = vi.fn();
    const { rerender } = renderTable(chainItem(), { onToggleChain });

    expect(screen.getByText('Chain.tag:{"count":2}')).toBeTruthy();
    expect(screen.queryByText('Chain.step:{"index":1}')).toBeNull();

    fireEvent.click(screen.getByTitle("Chain.showSteps"));
    expect(onToggleChain).toHaveBeenCalledWith("c1");

    rerender(
      <ScheduledTable
        loading={false}
        translation={t}
        filteredItems={[chainItem()]}
        openViewModal={vi.fn()}
        openEditModal={vi.fn()}
        canEditItem={canEditItem}
        handleDelete={vi.fn()}
        canDeleteItem={canDeleteItem}
        deletingId={null}
        expandedChains={new Set(["c1"])}
      />,
    );

    const second = screen.getByText('Chain.step:{"index":2}').closest("tr");
    expect(within(second).getByText("Chain.noText")).toBeTruthy();
    expect(within(second).getByText('Chain.files:{"count":2}')).toBeTruthy();
    expect(within(second).getByText('Chain.delay:{"minutes":30}')).toBeTruthy();
    expect(
      within(second).getByText('Chain.reached:{"count":1,"total":4}'),
    ).toBeTruthy();
  });

  it("agendada: cancelar; a decorrer: parar, com o progresso", () => {
    const onCloseChain = vi.fn();
    const scheduled = chainItem();
    const { unmount } = renderTable(scheduled, { onCloseChain });

    expect(screen.getByTitle("Chain.noEdit").disabled).toBe(true);
    fireEvent.click(screen.getByTitle("Chain.cancel"));
    expect(onCloseChain).toHaveBeenCalledWith(scheduled);
    unmount();

    renderTable(chainItem("running"), { onCloseChain });
    expect(screen.getByTitle("Chain.stop")).toBeTruthy();
    expect(
      screen.getByText('Chain.progress:{"done":1,"total":4}'),
    ).toBeTruthy();
  });
});

describe("tirar mensagens na tabela", () => {
  function expandedTable(item, props = {}) {
    return render(
      <ScheduledTable
        loading={false}
        translation={t}
        filteredItems={[item]}
        openViewModal={vi.fn()}
        openEditModal={vi.fn()}
        canEditItem={canEditItem}
        handleDelete={vi.fn()}
        canDeleteItem={canDeleteItem}
        deletingId={null}
        expandedChains={new Set([item.id])}
        {...props}
      />,
    );
  }

  it("cada mensagem tem o seu botão; as recebidas ficam bloqueadas", () => {
    const onRemoveStep = vi.fn();
    const item = chainItem("running");
    item.chain.steps[0].locked = true;
    item.chain.steps.push({ index: 3, preview: "Fim", reached: 0 });
    item.chain.stepCount = 3;

    expandedTable(item, { onRemoveStep });

    const buttons = screen.getAllByRole("button", { name: "Chain.removeStep" });
    expect(buttons).toHaveLength(3);
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[0].title).toBe("Chain.stepLocked");

    fireEvent.click(buttons[2]);
    expect(onRemoveStep).toHaveBeenCalledWith(item, item.chain.steps[2]);
  });

  it("com 2 mensagens, nenhuma se tira (cancela-se a corrente)", () => {
    expandedTable(chainItem());

    for (const button of screen.getAllByRole("button", {
      name: "Chain.removeStep",
    })) {
      expect(button.disabled).toBe(true);
      expect(button.title).toBe("Chain.minSteps");
    }
  });
});

describe("editar mensagens na tabela", () => {
  it("o lápis abre a edição; bloqueado nas recebidas e nas perguntas", () => {
    const onEditStep = vi.fn();
    const item = chainItem("running");
    item.chain.steps[0].locked = true;
    item.chain.steps[1].hasQuestion = true;
    item.chain.steps.push({ index: 3, preview: "Fim", reached: 0 });
    item.chain.stepCount = 3;

    render(
      <ScheduledTable
        loading={false}
        translation={t}
        filteredItems={[item]}
        openViewModal={vi.fn()}
        openEditModal={vi.fn()}
        canEditItem={canEditItem}
        handleDelete={vi.fn()}
        canDeleteItem={canDeleteItem}
        deletingId={null}
        expandedChains={new Set([item.id])}
        onEditStep={onEditStep}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Chain.editStep" });
    expect(buttons.map((b) => [b.disabled, b.title])).toEqual([
      [true, "Chain.stepLockedEdit"],
      [true, "Chain.questionNoEdit"],
      [false, "Chain.editStep"],
    ]);

    fireEvent.click(buttons[2]);
    expect(onEditStep).toHaveBeenCalledWith(item, item.chain.steps[2]);
  });

  it("o modal grava o texto novo e bloqueia acima do limite", () => {
    const onSave = vi.fn();
    render(
      <ChainStepEditModal
        step={{ index: 3, message: "Fim", fileCount: 0 }}
        isOpen
        onClose={vi.fn()}
        onSave={onSave}
        charLimit={10}
        translation={t}
      />,
    );

    const box = screen.getByRole("textbox");
    const save = screen.getByRole("button", { name: "Chain.editModal.save" });

    fireEvent.change(box, { target: { value: "Texto muito comprido" } });
    expect(save.disabled).toBe(true);

    fireEvent.change(box, { target: { value: "Até já" } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("Até já");
  });
});
