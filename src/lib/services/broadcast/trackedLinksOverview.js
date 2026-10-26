import {
  getTrackedLinkSendRows,
  listAllSavedTrackedLinks,
} from "@/lib/repos/trackedLinkSaved.repo";

/*
 * A página "Links Rastreados" numa só lista: cada link (nome + destino) com
 * os totais e os envios em que foi usado. Os links eliminados continuam na
 * lista (as estatísticas ficam sempre), marcados como eliminados.
 */

/* O mesmo link é o mesmo nome e o mesmo destino, como nos links guardados. */
function linkIdentity(label, url) {
  return `${String(label || "").trim()}\n${String(url || "").trim()}`;
}

function rate(clicked, recipients) {
  return recipients > 0 ? Number(((clicked / recipients) * 100).toFixed(1)) : 0;
}

/* Os envios de cada link, a partir das linhas por destinatário. */
function groupSends(rows) {
  const links = new Map();

  for (const row of rows) {
    const identity = linkIdentity(row.link_label, row.destination_url);
    if (!links.has(identity)) links.set(identity, new Map());
    const sends = links.get(identity);

    /* Um envio: o mesmo send_group_id (ou a mesma agendada, ou o mesmo minuto). */
    const sendKey =
      row.send_group_id ||
      row.scheduled_broadcast_id ||
      `${row.channel}|${String(row.created_at || "").slice(0, 16)}`;

    if (!sends.has(sendKey)) {
      sends.set(sendKey, {
        sendGroupId: row.send_group_id || null,
        channel: row.channel || "",
        createdAt: row.created_at || null,
        recipientIds: new Set(),
        clickedIds: new Set(),
        totalClicks: 0,
      });
    }

    const send = sends.get(sendKey);
    if (
      row.created_at &&
      (!send.createdAt || row.created_at < send.createdAt)
    ) {
      send.createdAt = row.created_at;
    }

    const clicks = Array.isArray(row.tracked_link_event)
      ? row.tracked_link_event.length
      : 0;
    send.totalClicks += clicks;

    if (row.recipient_user_id != null) {
      const recipient = String(row.recipient_user_id);
      send.recipientIds.add(recipient);
      if (clicks > 0) send.clickedIds.add(recipient);
    }
  }

  const result = new Map();
  for (const [identity, sends] of links) {
    result.set(
      identity,
      Array.from(sends.values())
        .map((send) => ({
          sendGroupId: send.sendGroupId,
          channel: send.channel,
          createdAt: send.createdAt,
          recipientCount: send.recipientIds.size,
          clickedCount: send.clickedIds.size,
          totalClicks: send.totalClicks,
          clickRate: rate(send.clickedIds.size, send.recipientIds.size),
        }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    );
  }
  return result;
}

function totalsOf(sends) {
  const recipients = sends.reduce((sum, send) => sum + send.recipientCount, 0);
  const clicked = sends.reduce((sum, send) => sum + send.clickedCount, 0);

  return {
    sends: sends.length,
    recipients,
    clicked,
    clickRate: rate(clicked, recipients),
  };
}

/**
 * Lista única de links da organização: os guardados (ativos e eliminados) e
 * os que só aparecem em envios antigos. Ativos primeiro, do mais recente
 * para o mais antigo; os eliminados no fim.
 */
export async function getTrackedLinksOverview(orgId, { deps = {} } = {}) {
  const readSaved = deps.listAllSavedTrackedLinks || listAllSavedTrackedLinks;
  const readRows = deps.getTrackedLinkSendRows || getTrackedLinkSendRows;

  const [saved, rows] = await Promise.all([readSaved(orgId), readRows(orgId)]);
  const sendsByLink = groupSends(rows);
  const links = [];

  /*
   * Um link eliminado e criado outra vez é o mesmo grupo: fica o ativo (volta
   * à cor normal), com os envios de antes e de depois.
   */
  const savedByIdentity = new Map();
  for (const link of saved) {
    const identity = linkIdentity(link.link_label, link.destination_url);
    const current = savedByIdentity.get(identity);
    if (!current || (current.deleted_at && !link.deleted_at)) {
      savedByIdentity.set(identity, link);
    }
  }
  const seen = new Set(savedByIdentity.keys());

  for (const [identity, link] of savedByIdentity) {
    const sends = sendsByLink.get(identity) || [];

    links.push({
      id: link.id,
      label: String(link.link_label || "").trim(),
      destinationUrl: String(link.destination_url || "").trim(),
      key: link.link_key || "",
      createdAt: link.created_at || null,
      lastActivityAt:
        sends[0]?.createdAt || link.last_used_at || link.created_at,
      deleted: Boolean(link.deleted_at),
      sends,
      totals: totalsOf(sends),
    });
  }

  /* Links só de envios antigos, que não estão nos guardados: como eliminados. */
  for (const [identity, sends] of sendsByLink) {
    if (seen.has(identity)) continue;
    const [label, destinationUrl] = identity.split("\n");

    links.push({
      id: null,
      label,
      destinationUrl,
      key: "",
      createdAt: sends[sends.length - 1]?.createdAt || null,
      lastActivityAt: sends[0]?.createdAt || null,
      deleted: true,
      sends,
      totals: totalsOf(sends),
    });
  }

  return links.sort((a, b) => {
    if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
    return String(b.lastActivityAt || "").localeCompare(
      String(a.lastActivityAt || ""),
    );
  });
}
