import { createTrackedLink } from "@/lib/repos/trackedLinks.repo";
import { listSavedTrackedLinks } from "@/lib/repos/trackedLinkSaved.repo";
import crypto from "crypto";
import { isAllowedDestinationUrl } from "@/lib/security/destinationUrl";
import { withButtonLinksInText } from "@/lib/whatsapp/linkButton";
import { toTeamsMarkdown } from "@/lib/whatsapp/textFormat";

function makeToken() {
  return crypto.randomBytes(18).toString("base64url");
}

function getAppBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;

  if (!base) {
    throw new Error(
      "Missing app base URL. Set NEXT_PUBLIC_APP_URL or APP_URL.",
    );
  }

  return String(base).replace(/\/$/, "");
}

/* Troca cada {{link.chave}} pelo URL rastreado, e mais nada (WhatsApp). */
export function replaceTrackedLinksInText(message = "", resolvedLinks = []) {
  let out = String(message || "");

  for (const link of resolvedLinks) {
    const placeholder = `{{link.${link.key}}}`;
    out = out.split(placeholder).join(link.trackedUrl);
  }

  return out;
}

/*
 * Texto para o Teams, que usa Markdown e não tem os botões do WhatsApp:
 * - a formatação do WhatsApp passa a Markdown (`*negrito*` seria itálico);
 * - um link marcado como botão que não está no texto vai para o fim, com o
 *   nome;
 * - os links são trocados pelos URLs rastreados.
 * O WhatsApp usa replaceTrackedLinksInText.
 */
export function replaceTrackedPlaceholders(message = "", resolvedLinks = []) {
  const markdown = withButtonLinksInText(
    toTeamsMarkdown(message),
    resolvedLinks,
    { markdown: true },
  );

  return replaceTrackedLinksInText(markdown, resolvedLinks);
}

export async function createTrackedLinkForRecipient({
  orgId,
  channel,
  recipientUserId = null,
  scheduledBroadcastId = null,
  sendGroupId = null,
  destinationUrl,
  linkLabel,
  linkKey = null,
  createdByUserId = null,
}) {
  if (!isAllowedDestinationUrl(destinationUrl)) {
    throw new Error("O destino do link tem de começar por http:// ou https://");
  }
  const token = makeToken();

  const trackedLink = await createTrackedLink({
    org_id: orgId,
    channel,
    recipient_user_id: recipientUserId,
    scheduled_broadcast_id: scheduledBroadcastId,
    send_group_id: sendGroupId,
    destination_url: destinationUrl,
    link_label: linkLabel,
    token,
    link_key: linkKey,
    source_type: "broadcast",
    created_by_user_id: createdByUserId,
  });

  return {
    row: trackedLink,
    trackedUrl: `${getAppBaseUrl()}/r/${token}`,
  };
}

/**
 * Links já usados pela organização, para o composer os poder escolher em vez
 * de os escrever outra vez. Chegam do mais recente para o mais antigo; os
 * que só diferem em espaços juntam-se no mais recente. Um link sem nome ou
 * com um destino que o envio recusaria não aparece.
 */
export async function listReusableTrackedLinks(orgId) {
  /* Os links guardados e não eliminados (#189). */
  const rows = await listSavedTrackedLinks(orgId);
  const seen = new Set();
  const items = [];

  for (const row of rows) {
    const label = String(row?.link_label || "").trim();
    const destinationUrl = String(row?.destination_url || "").trim();

    if (!label || !isAllowedDestinationUrl(destinationUrl)) continue;

    const identity = `${label}\n${destinationUrl}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    items.push({
      id: row.id,
      key: String(row.link_key || "").trim(),
      label,
      destinationUrl,
      createdAt: row.created_at || null,
      lastUsedAt: row.last_used_at || null,
    });
  }

  return items;
}

function buttonFields(link) {
  const buttonMessage = String(link?.buttonMessage || "").trim();

  return { button: true, ...(buttonMessage ? { buttonMessage } : {}) };
}

export async function resolveTrackedLinksForRecipient({
  trackedLinks = [],
  orgId,
  channel,
  recipientUserId = null,
  scheduledBroadcastId = null,
  sendGroupId = null,
  createdByUserId = null,
}) {
  const resolved = [];

  for (const link of trackedLinks) {
    const key = String(link?.key || "").trim();
    const label = String(link?.label || "").trim();
    const destinationUrl = String(link?.destinationUrl || "").trim();

    if (!key || !label || !destinationUrl) continue;

    const { trackedUrl } = await createTrackedLinkForRecipient({
      orgId,
      channel,
      recipientUserId,
      scheduledBroadcastId,
      sendGroupId,
      destinationUrl,
      linkLabel: label,
      linkKey: key,
      createdByUserId,
    });

    resolved.push({
      key,
      label,
      destinationUrl,
      trackedUrl,
      /*
       * Link de um botão no WhatsApp; não precisa de estar no texto. Do
       * segundo em diante, segue num balão à parte com `buttonMessage`.
       */
      ...(link.button === true ? buttonFields(link) : {}),
    });
  }

  return resolved;
}
