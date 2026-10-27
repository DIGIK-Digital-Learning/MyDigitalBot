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
