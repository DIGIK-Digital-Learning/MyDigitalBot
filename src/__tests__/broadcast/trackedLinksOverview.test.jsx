import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/*
 * Página Links Rastreados numa só lista: cada link (nome + destino) com os
 * totais e os envios; os eliminados no fim, com as estatísticas. E a
 * paginação partilhada com as mensagens agendadas.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values?.count !== undefined ? `${key}:${values.count}` : key,
}));

import { getTrackedLinksOverview } from "@/lib/services/broadcast/trackedLinksOverview";
import Pagination, {
  pageNumbers,
} from "@/app/components/Pagination/Pagination";

const GUIA = { label: "Guia", url: "https://ex.pt/guia" };

/* Uma linha por destinatário de um envio, com os cliques dele. */
function rows(send, recipients, clickedRecipients = []) {
  return recipients.map((userId) => ({
    channel: send.channel,
    recipient_user_id: userId,
    send_group_id: send.group,
    destination_url: send.url,
    link_label: send.label,
    created_at: send.at,
    tracked_link_event: clickedRecipients.includes(userId)
      ? [{ id: `c${userId}` }]
      : [],
  }));
}

async function overview(saved, sendRows) {
  return getTrackedLinksOverview(1, {
    deps: {
      listAllSavedTrackedLinks: async () => saved,
      getTrackedLinkSendRows: async () => sendRows,
    },
  });
}

describe("getTrackedLinksOverview", () => {
  it("junta os envios do mesmo link e soma os totais", async () => {
    const links = await overview(
      [
        {
          id: "g",
          link_label: "Guia",
          destination_url: GUIA.url,
          created_at: "2026-10-01",
        },
      ],
      [
        ...rows(
          {
            ...GUIA,
            channel: "teams",
            group: "s1",
            at: "2026-10-21T10:00:00Z",
          },
          [1, 2, 3],
          [1, 2],
        ),
        ...rows(
          {
            ...GUIA,
            channel: "whatsapp",
            group: "s2",
            at: "2026-10-23T10:00:00Z",
          },
          [1, 2, 3],
          [3],
        ),
      ],
    );

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: "g",
      label: "Guia",
      deleted: false,
      totals: { sends: 2, recipients: 6, clicked: 3, clickRate: 50 },
    });
    /* O envio mais recente primeiro. */
    expect(
      links[0].sends.map((s) => [s.channel, s.recipientCount, s.clickedCount]),
    ).toEqual([
      ["whatsapp", 3, 1],
      ["teams", 3, 2],
    ]);
  });

  it("uma mensagem com dois links conta um envio em cada link", async () => {
    const links = await overview(
      [
        { id: "g", link_label: "Guia", destination_url: GUIA.url },
        {
          id: "f",
          link_label: "Férias",
          destination_url: "https://ex.pt/ferias",
        },
      ],
      [
        ...rows(
          { ...GUIA, channel: "teams", group: "s1", at: "2026-10-21" },
          [1, 2],
        ),
        ...rows(
          {
            label: "Férias",
            url: "https://ex.pt/ferias",
            channel: "teams",
            group: "s1",
            at: "2026-10-21",
          },
          [1, 2],
          [2],
        ),
      ],
    );

    expect(
      links.map((l) => [l.label, l.totals.sends, l.totals.clicked]),
    ).toEqual(
      expect.arrayContaining([
        ["Guia", 1, 0],
        ["Férias", 1, 1],
      ]),
    );
  });

  it("os eliminados ficam no fim, com as estatísticas", async () => {
    const links = await overview(
      [
        {
          id: "x",
          link_label: "Antigo",
          destination_url: "https://ex.pt/a",
          deleted_at: "2026-10-20",
        },
        {
          id: "n",
          link_label: "Novo",
          destination_url: "https://ex.pt/n",
          created_at: "2026-10-25",
        },
      ],
      rows(
        {
          label: "Antigo",
          url: "https://ex.pt/a",
          channel: "teams",
          group: "s9",
          at: "2026-10-10",
        },
        [1],
        [1],
      ),
    );

    expect(links.map((l) => [l.label, l.deleted])).toEqual([
      ["Novo", false],
      ["Antigo", true],
    ]);
    expect(links[1].totals).toMatchObject({ sends: 1, clicked: 1 });
  });

  it("um link eliminado e criado outra vez volta ao grupo normal, com os envios todos", async () => {
    const links = await overview(
      [
        {
          id: "old",
          link_label: "Guia",
          destination_url: GUIA.url,
          deleted_at: "2026-10-20",
        },
        {
          id: "new",
          link_label: "Guia",
          destination_url: GUIA.url,
          created_at: "2026-10-25",
        },
      ],
      [
        ...rows(
          { ...GUIA, channel: "teams", group: "s1", at: "2026-10-10" },
          [1],
        ),
        ...rows(
          { ...GUIA, channel: "teams", group: "s2", at: "2026-10-25" },
          [1],
        ),
      ],
    );

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: "new", deleted: false });
    expect(links[0].totals.sends).toBe(2);
  });

  it("um link ainda por enviar aparece com zero envios", async () => {
    const [link] = await overview(
      [{ id: "n", link_label: "Novo", destination_url: "https://ex.pt/n" }],
      [],
    );

    expect(link.totals).toEqual({
      sends: 0,
      recipients: 0,
      clicked: 0,
      clickRate: 0,
    });
  });
});

describe("Paginação", () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 10, [1, 2, "…", 10]],
    [5, 12, [1, "…", 4, 5, 6, "…", 12]],
    [12, 12, [1, "…", 11, 12]],
  ])("página %i de %i → %j", (current, total, expected) => {
    expect(pageNumbers(current, total)).toEqual(expected);
  });

  it("muda de página e de tamanho", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    render(
      <Pagination
        page={1}
        pageSize={20}
        total={48}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        summary="Página 1 de 3"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Pagination.previous" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
