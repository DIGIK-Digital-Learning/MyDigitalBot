import { getBotToken } from "@/lib/teams/auth";
import { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";

export async function sendReply(activity, text, opts = {}) {
  const {
    replyToId = activity?.id,

    serviceUrl = activity?.serviceUrl,

    conversationId = activity?.conversation?.id,

    attachments = null,
  } = opts;

  if (!serviceUrl || !conversationId) {
    console.error("[TEAMS] sendReply missing serviceUrl/conversationId", {
      serviceUrl,
      conversationId,
    });

    return {
      ok: false,
      error: "Missing serviceUrl/conversationId",
    };
  }

  if (!isTrustedTeamsServiceUrl(serviceUrl)) {
    return { ok: false, error: "Endereço do serviço Teams não autorizado." };
  }

  const token = await getBotToken();

  const base = serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`;

  const url = `${base}v3/conversations/${encodeURIComponent(conversationId)}/activities`;

  const payload = {
    type: "message",

    text: String(text ?? ""),

    ...(attachments ? { attachments } : {}),

    ...(replyToId
      ? {
          replyToId,
        }
      : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    redirect: "error",

    headers: {
      Authorization: `Bearer ${token}`,

      "Content-Type": "application/json",
    },

    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");

    console.error("[TEAMS] Failed to send reply", res.status, body);

    return {
      ok: false,
      status: res.status,
      body,
    };
  }

  const data = await res.json().catch(() => null);

  return {
    ok: true,

    id: data?.id ?? null,
  };
}
