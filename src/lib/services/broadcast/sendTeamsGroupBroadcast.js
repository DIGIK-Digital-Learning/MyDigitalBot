import crypto from "crypto";
import { openai } from "@/lib/openai/client";
import { getBotToken } from "@/lib/teams/auth";
import { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";
import { getOrganization } from "@/lib/repos/organizations.repo";
import { getGroupInstallationsByIds } from "@/lib/repos/teamsInstallations.repo";
import { createMessage } from "@/lib/repos/messages.repo";
import {
  createThread,
  getGroupThreadForConversation,
} from "@/lib/repos/threads.repo";
import { createConversation } from "@/lib/services/openaiResponses.service";
import { BroadcastError, normalizeFiles } from "./shared";
import { buildTeamsFileParts } from "./teamsAttachments";
import { interpolateBroadcastMessage } from "./interpolateMessage";

/*
 * Conversa do grupo onde a mensagem fica guardada. Um grupo onde ninguém
 * falou ainda com o bot pode não ter conversa; cria-se aqui.
 */
async function ensureGroupThread(group) {
  const existing = await getGroupThreadForConversation({
    assistantId: group.assistant_id,
    channel: "teams",
    externalConversationId: group.conversation_id,
  });

  if (existing) return existing;

  const conversation = await createConversation({
    assistantId: group.assistant_id,
    organizationId: group.organization_id,
    channel: "teams",
    scope: "group",
    externalConversationId: group.conversation_id,
  });

  return createThread({
    userId: null,
    assistantId: group.assistant_id,
    openAiConversationId: conversation.id,
    channel: "teams",
    scope: "group",
    externalConversationId: group.conversation_id,
  });
}

/*
 * A mensagem entra no contexto do assistente do grupo, para ele saber do
 * que se fala quando alguém lhe perguntar sobre ela.
 */
async function appendToAssistantContext(thread, text) {
  if (!thread?.openai_conversation_id || !text.trim()) return;

  await openai.conversations.items.create(
    thread.openai_conversation_id,
    { items: [{ type: "message", role: "assistant", content: text }] },
    { timeout: 10000, maxRetries: 0 },
  );
}

async function recordGroupMessage({
  group,
  orgId,
  text,
  providerMessageId,
  scheduledBroadcastId,
}) {
  const thread = await ensureGroupThread(group);

  /* Sem assistente: no detalhe do grupo aparece como enviada pela plataforma. */
  await createMessage({
    threadId: thread?.id ?? null,
    userId: null,
    organizationId: orgId,
    assistantId: null,
    channel: "teams",
    messageId: providerMessageId,
    content: text,
    role: "assistant",
    deliveryStatus: "accepted",
    scheduledBroadcastId,
  });

  await appendToAssistantContext(thread, text);
}

/**
 * Envia uma mensagem em branco (texto e ficheiros) a grupos do Teams (#166).
 * Num grupo não há destinatário único, por isso {{nome}} fica vazio e não há
 * links rastreados nem perguntas.
 */
export async function sendTeamsGroupBroadcast(input = {}) {
  const {
    orgId,
    groupIds = [],
    message = "",
    files = [],
    imageUrls = [],
    scheduledBroadcastId = null,
    sendGroupId = crypto.randomUUID(),
  } = input;

  const ids = [...new Set((groupIds || []).map(Number).filter((id) => id > 0))];

  if (!orgId || !ids.length) {
    throw new BroadcastError("Missing orgId or groupIds", 400);
  }

  const normalizedFiles = normalizeFiles({ files, imageUrls });

  if (!String(message || "").trim() && normalizedFiles.length === 0) {
    throw new BroadcastError("Message or files must be provided", 400);
  }

  const org = await getOrganization(orgId);
  if (!org) throw new BroadcastError("Organization not found", 400);

  const groups = await getGroupInstallationsByIds({
    organizationId: orgId,
    ids,
  });
  const byId = new Map(groups.map((group) => [Number(group.id), group]));

  const fileParts = buildTeamsFileParts(normalizedFiles);
  const text =
    [
      interpolateBroadcastMessage(message, { user: null, org }).trim(),
      fileParts.linksText,
    ]
      .filter(Boolean)
      .join("\n\n") || " ";

  const payload = {
    type: "message",
    text,
    textFormat: "markdown",
    attachments: fileParts.attachments,
  };

  const results = [];

  for (const groupId of ids) {
    const group = byId.get(groupId);

    if (!group) {
      results.push({ groupId, ok: false, error: "Group not found." });
      continue;
    }

    if (group.is_active === false) {
      results.push({
        groupId,
        ok: false,
        error: "The bot is no longer in this group.",
      });
      continue;
    }

    if (!isTrustedTeamsServiceUrl(group.service_url)) {
      results.push({
        groupId,
        ok: false,
        error: "Untrusted Teams service URL.",
      });
      continue;
    }

    try {
      const token = await getBotToken(group.tenant_id);
      const endpoint = `${String(group.service_url).replace(/\/$/, "")}/v3/conversations/${encodeURIComponent(group.conversation_id)}/activities`;

      const res = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        /* A mensagem já saiu: uma falha a guardar fica só no log. */
        try {
          await recordGroupMessage({
            group,
            orgId,
            text,
            providerMessageId: data?.id ?? null,
            scheduledBroadcastId,
          });
        } catch (recordErr) {
          console.error("[Teams group broadcast] could not record message", {
            groupId,
            error: recordErr?.message || String(recordErr),
          });
        }
      }

      results.push({
        groupId,
        ok: res.ok,
        status: res.status,
        providerMessageId: data?.id ?? null,
        ...(res.ok
          ? {}
          : { error: data?.error?.message || `Teams answered ${res.status}.` }),
      });
    } catch (err) {
      results.push({ groupId, ok: false, error: err?.message || String(err) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;

  return {
    sendGroupId,
    ok: okCount,
    failed: results.length - okCount,
    results,
    error:
      okCount === 0
        ? results[0]?.error || "Teams group broadcast failed."
        : null,
  };
}
