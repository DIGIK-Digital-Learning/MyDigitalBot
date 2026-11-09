export const OPENING_GATE_VALIDITY_DAYS = 14;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function openingGateExpiresAt(now = Date.now()) {
  return new Date(now + OPENING_GATE_VALIDITY_DAYS * DAY_IN_MS);
}

function parsePayload(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function findPendingOpeningGate(pendingMessages = []) {
  if (!Array.isArray(pendingMessages)) return null;

  return (
    pendingMessages.find((row) => {
      const payload = parsePayload(row?.payload);
      return Boolean(row?.template_message_id) || payload.openingGate === true;
    }) || null
  );
}

/**
 * Normaliza as respostas rápidas dos formatos de webhook usados pela Bird e
 * pelo Conversations API. Só um botão interativo é uma resposta rápida válida.
 */
export function extractWhatsappQuickReply(payload = {}) {
  const body = payload?.body ?? {};
  const content = payload?.content ?? {};
  const interactive =
    body?.interactive ?? content?.interactive ?? payload?.interactive ?? {};
  const interactiveReply =
    body?.interactive_reply ??
    content?.interactive_reply ??
    payload?.interactive_reply ??
    {};

  const reply =
    interactive?.reply ??
    interactive?.button_reply ??
    interactiveReply?.button ??
    interactiveReply?.reply ??
    body?.button_reply ??
    content?.button_reply ??
    payload?.button_reply ??
    (body?.type === "interactive_reply" ? body?.interactive_reply : null) ??
    null;

  const textActions = Array.isArray(body?.text?.actions)
    ? body.text.actions
    : Array.isArray(content?.text?.actions)
      ? content.text.actions
      : [];
  const postback = textActions.find((action) => action?.type === "postback");

  const isQuickReply =
    interactive?.type === "button_reply" ||
    interactiveReply?.type === "button" ||
    interactiveReply?.type === "button_reply" ||
    body?.type === "button_reply" ||
    ((body?.type === "interactive_reply" ||
      interactiveReply?.type === "interactive_reply") &&
      Boolean(reply)) ||
    Boolean(postback);

  const replyToMessageId =
    payload?.replyTo?.id ??
    payload?.reply_to?.id ??
    payload?.in_reply_to_message_id ??
    payload?.replyToMessageId ??
    body?.replyTo?.id ??
    null;

  const text =
    reply?.text ??
    reply?.title ??
    interactiveReply?.text ??
    postback?.postback?.text ??
    body?.text?.text ??
    body?.text?.body ??
    (typeof body?.text === "string" ? body.text : "") ??
    content?.text?.body ??
    (typeof content?.text === "string" ? content.text : "") ??
    "";

  return {
    isQuickReply,
    text: String(text || ""),
    replyToMessageId: replyToMessageId ? String(replyToMessageId) : null,
  };
}

export function isReplyToOpeningGate(reply, gate) {
  const replyToId = String(reply?.replyToMessageId || "").trim();
  const templateMessageId = String(gate?.template_message_id || "").trim();

  return Boolean(
    reply?.isQuickReply &&
      replyToId &&
      templateMessageId &&
      replyToId === templateMessageId,
  );
}
