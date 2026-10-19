/* --------------------
WhatsApp inbound webhook + read receipt webhook
----------------------*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import crypto from "crypto";
import {
  recordWebhookEvent,
  markWebhookEventProcessing,
  markWebhookEventDone,
  markWebhookEventFailed,
} from "@/lib/repos/webhookEvents.repo";

import {
  getUserByNumber,
  getUserByWhatsappBsuid,
  getUserByBirdContactId,
  updateUserWhatsappIdentity,
} from "@/lib/repos/user.repo";

import {
  createThread,
  getLatestUserThreadForChannel,
  getUserThreadForChannel,
  setThreadConversationId,
} from "@/lib/repos/threads.repo";

import {
  getAssistantById,
  getAssistantsInOrg,
} from "@/lib/repos/assistants.repo";

import {
  createConversation,
  generateAssistantResponse,
} from "@/lib/services/openaiResponses.service";

import {
  getOrganization,
  getOrganizationByChannelId,
} from "@/lib/repos/organizations.repo";

import {
  createMessage,
  getMessagesInThread,
  markMessageReadByProviderId,
} from "@/lib/repos/messages.repo";

import {
  getAllPendingOutreachByUser,
  claimPendingOutreach,
  releasePendingOutreach,
  markPendingOutreachReplied,
} from "@/lib/repos/pendingOutreach.repo";
import {
  acceptWhatsappOpeningGate,
  getWhatsappOpeningGate,
} from "@/lib/repos/whatsappOpeningGate.repo";
import {
  extractWhatsappQuickReply,
  findPendingOpeningGate,
  isReplyToOpeningGate,
} from "@/lib/whatsapp/openingGate";

import {
  createMessageChainDelivery,
  getValidatedMessageChainContext,
  updateMessageChainRecipientProgress,
} from "@/lib/repos/messageChain.repo";

import { splitE164 } from "@/lib/whatsapp/E164";
import { followUpBodies } from "@/lib/whatsapp/linkButton";

import { processReadChainAfterRead } from "@/lib/services/broadcast/readChains/processReadChainAfterRead";

import { handleQuestionReply } from "@/lib/services/questions/handleQuestionReply";
import { handleAssistantSwitch } from "@/lib/services/assistants/handleAssistantSwitch";

import { assertAssistantBelongsToOrg } from "@/lib/auth/guards";

import { recordSystemAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

import { getSupabaseAdminClient } from "@/lib/db/admin";

const SIGNING_KEY = process.env.MESSAGEBIRD_SIGNING_KEY;

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function normalizeId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const str = String(value).trim();

  return str.length > 0 ? str : null;
}

function normalizeUsername(value) {
  const str = normalizeId(value);

  return str ? str.toLowerCase() : null;
}

function normalizePhone(value) {
  const raw = normalizeId(value);

  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");

  if (digits.length < 7) {
    return null;
  }

  return raw;
}

function extractBirdMessageId(data) {
  return (
    data?.id ||
    data?.message?.id ||
    data?.payload?.id ||
    data?.result?.id ||
    data?.results?.[0]?.id ||
    data?.messages?.[0]?.id ||
    null
  );
}

function safePayload(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/*
 * Convert local DB message history into initial
 * OpenAI Conversation items.
 *
 * Used only when lazily migrating an existing
 * Assistants API thread to Conversations.
 */
function buildConversationHistoryItems(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => {
      const role = message?.role;

      const content = message?.content;

      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim()
      );
    })
    .slice(-20)
    .map((message) => ({
      type: "message",
      role: message.role,
      content: message.content.trim(),
    }));
}

/* =========================================================
   MESSAGEBIRD SIGNATURE
   ========================================================= */

function isFreshTimestamp(timestamp, toleranceSeconds = 300) {
  const numericTimestamp = Number(timestamp);

  if (!Number.isFinite(numericTimestamp)) {
    return false;
  }

  const timestampMs =
    numericTimestamp > 1e12 ? numericTimestamp : numericTimestamp * 1000;

  return Math.abs(Date.now() - timestampMs) <= toleranceSeconds * 1000;
}

function isValid(sigB64, ts, fullUrl, raw) {
  if (!SIGNING_KEY || !sigB64 || !ts || !fullUrl) {
    return false;
  }

  const bodyHash = crypto.createHash("sha256").update(raw).digest();

  const payload = Buffer.concat([Buffer.from(`${ts}\n${fullUrl}\n`), bodyHash]);

  const expected = crypto
    .createHmac("sha256", SIGNING_KEY)
    .update(payload)
    .digest();

  const received = Buffer.from(sigB64, "base64");

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

/* =========================================================
   WHATSAPP IDENTITY
   ========================================================= */

function getIdentifier(contact, key) {
  const cleanKey = String(key || "").toLowerCase();

  return (
    (contact?.identifiers || []).find(
      (x) => String(x?.identifierKey || "").toLowerCase() === cleanKey,
    )?.identifierValue || null
  );
}

function getPortfolioScopedBsuid(contact) {
  return (
    (contact?.identifiers || []).find((x) =>
      String(x?.identifierKey || "")
        .toLowerCase()
        .startsWith("whatsapp_"),
    )?.identifierValue || null
  );
}

function extractWhatsappIdentity(payload) {
  const sender = payload?.sender || {};

  const senderContact = sender?.contact || {};

  const extra = payload?.meta?.extraInformation || {};

  const contactId =
    normalizeId(senderContact.id) || normalizeId(payload?.contact?.id) || null;

  const senderKey = String(
    senderContact.identifierKey || sender.identifierKey || "",
  ).toLowerCase();

  const senderValue =
    normalizeId(senderContact.identifierValue) ||
    normalizeId(sender.identifierValue) ||
    null;

  const phoneNumber =
    normalizePhone(extra.phoneNumber) ||
    normalizePhone(extra.phone_number) ||
    normalizePhone(getIdentifier(senderContact, "phonenumber")) ||
    (senderKey === "phonenumber" ? normalizePhone(senderValue) : null);

  const whatsappBsuid =
    normalizeId(extra.whatsappbsuid) ||
    normalizeId(extra.whatsappBsuid) ||
    normalizeId(getIdentifier(senderContact, "whatsappbsuid")) ||
    normalizeId(getPortfolioScopedBsuid(senderContact));

  const whatsappUsername =
    normalizeUsername(extra.whatsappusername) ||
    normalizeUsername(extra.whatsappUsername) ||
    normalizeUsername(getIdentifier(senderContact, "whatsappusername")) ||
    (senderKey === "whatsappusername" ? normalizeUsername(senderValue) : null);

  return {
    phoneNumber,
    whatsappBsuid,
    whatsappUsername,
    birdContactId: contactId,
  };
}

/* =========================================================
   READ RECEIPTS
   ========================================================= */

function extractReadInteraction(evt) {
  const payload = evt?.payload || {};

  const isReadInteraction =
    evt?.service === "channels" &&
    evt?.event === "whatsapp.interaction" &&
    payload?.type === "read";

  if (!isReadInteraction) {
    return null;
  }

  return {
    messageId: normalizeId(payload.messageId),

    channelId: normalizeId(payload.channelId),

    readAt:
      normalizeId(payload.createdAt) ||
      normalizeId(payload.updatedAt) ||
      new Date().toISOString(),
  };
}

async function handleReadInteraction(readInteraction) {
  if (!readInteraction.messageId) {
    console.warn("Read interaction missing messageId", {
      channelId: readInteraction.channelId,
    });

    return;
  }

  /*
   * Require channelId so we can scope this
   * receipt to an organization.
   */
  if (!readInteraction.channelId) {
    console.warn("Read interaction missing channelId", {
      messageId: readInteraction.messageId,
    });

    return;
  }

  let organization;

  try {
    organization = await getOrganizationByChannelId(readInteraction.channelId);
  } catch (err) {
    console.error("Could not resolve read interaction organization", {
      channelId: readInteraction.channelId,

      messageId: readInteraction.messageId,

      message: err?.message || String(err),
    });

    throw new Error("Could not resolve read receipt organization");
  }

  if (!organization) {
    console.warn("Read interaction channel has no organization", {
      channelId: readInteraction.channelId,

      messageId: readInteraction.messageId,
    });

    return;
  }

  const updated = await markMessageReadByProviderId(
    readInteraction.messageId,
    readInteraction.readAt,
    organization.id,
  );

  if (!updated) {
    console.warn("Read interaction message not found locally", {
      messageId: readInteraction.messageId,

      channelId: readInteraction.channelId,

      organizationId: organization.id,

      readAt: readInteraction.readAt,
    });

    return;
  }

  if (Number(updated.organization_id) !== Number(organization.id)) {
    throw new Error(
      "Read receipt message does not belong to channel organization",
    );
  }

  if (!updated.message_chain_id) {
    return;
  }

  try {
    const chainResult = await processReadChainAfterRead(updated);

    console.log("Read chain processed after read interaction", {
      messageId: readInteraction.messageId,

      messageDbId: updated.id,

      chainId: updated.message_chain_id,

      stepIndex: updated.message_chain_step_index,

      result: chainResult,
    });
  } catch (err) {
    console.error("Failed to process read chain after read interaction", {
      messageId: readInteraction.messageId,

      messageDbId: updated.id,

      chainId: updated.message_chain_id,

      stepIndex: updated.message_chain_step_index,

      error: err?.message || String(err),
    });
  }
}

/* =========================================================
   USER LOOKUP
   ========================================================= */

async function findUserFromPhone(rawPhone, organizationId) {
  if (!organizationId) {
    return null;
  }

  const digits = String(rawPhone || "").replace(/\D/g, "");

  const { nationalNumber } = splitE164(rawPhone || "");

  let user = null;

  if (nationalNumber) {
    user = await getUserByNumber(nationalNumber, organizationId);
  }

  if (!user && digits) {
    user = await getUserByNumber(digits, organizationId);
  }

  return user;
}

async function findUserFromWhatsappIdentity(identity, organizationId) {
  if (!organizationId) {
    return null;
  }

  if (identity.whatsappBsuid) {
    const user = await getUserByWhatsappBsuid(
      identity.whatsappBsuid,
      organizationId,
    );

    if (user) {
      return user;
    }
  }

  if (identity.birdContactId) {
    const user = await getUserByBirdContactId(
      identity.birdContactId,
      organizationId,
    );

    if (user) {
      return user;
    }
  }

  if (identity.phoneNumber) {
    return await findUserFromPhone(identity.phoneNumber, organizationId);
  }

  return null;
}

/* =========================================================
   BIRD OUTBOUND
   ========================================================= */

function buildReceiverContact({ contactId, phoneNumber, whatsappBsuid }) {
  if (contactId) {
    return {
      id: contactId,
    };
  }

  if (phoneNumber) {
    return {
      identifierKey: "phonenumber",

      identifierValue: phoneNumber,
    };
  }

  if (whatsappBsuid) {
    return {
      identifierKey: "whatsappbsuid",

      identifierValue: whatsappBsuid,
    };
  }

  return null;
}

async function sendBirdMessage({
  channelId,
  contactId,
  phoneNumber,
  whatsappBsuid,
  body,
}) {
  const cleanChannelId = normalizeId(channelId);

  const receiverContact = buildReceiverContact({
    contactId: normalizeId(contactId),

    phoneNumber: normalizeId(phoneNumber),

    whatsappBsuid: normalizeId(whatsappBsuid),
  });

  if (!cleanChannelId) {
    return {
      ok: false,

      status: 400,

      data: {
        error: "Missing MessageBird/Bird channelId",
      },

      providerMessageId: null,
    };
  }

  if (!receiverContact) {
    return {
      ok: false,

      status: 400,

      data: {
        error: "Missing MessageBird/Bird contactId",
      },

      providerMessageId: null,
    };
  }

  if (!process.env.WORKSPACE_ID) {
    return {
      ok: false,

      status: 500,

      data: {
        error: "Missing WORKSPACE_ID env variable",
      },

      providerMessageId: null,
    };
  }

  if (!process.env.BIRD_API_KEY) {
    return {
      ok: false,

      status: 500,

      data: {
        error: "Missing BIRD_API_KEY env variable",
      },

      providerMessageId: null,
    };
  }

  let res;

  try {
    res = await fetch(
      `https://api.bird.com/workspaces/${process.env.WORKSPACE_ID}/channels/${cleanChannelId}/messages`,
      {
        method: "POST",

        headers: {
          Authorization: `AccessKey ${process.env.BIRD_API_KEY}`,

          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          receiver: {
            contacts: [receiverContact],
          },

          body,
        }),
      },
    );
  } catch (err) {
    return {
      ok: false,

      status: 500,

      data: {
        error: "Failed to call Bird API",

        message: err?.message || String(err),
      },

      providerMessageId: null,
    };
  }

  const raw = await res.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  return {
    ok: res.ok,

    status: res.status,

    data,

    providerMessageId: extractBirdMessageId(data),
  };
}

/* =========================================================
   ROUTES
   ========================================================= */

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "messagebird",
  });
}

export async function POST(req) {
  const rawBody = await req.text();

  const sigHeader = req.headers.get("messagebird-signature") ?? "";

  const tsHeader = req.headers.get("messagebird-request-timestamp") ?? "";

  /*
   * Prevent replaying old signed webhook
   * requests.
   */
  if (!isFreshTimestamp(tsHeader)) {
    console.warn("Expired or invalid MessageBird timestamp");

    return new NextResponse("invalid timestamp", {
      status: 401,
    });
  }

  const proto = req.headers.get("x-forwarded-proto") || "https";

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");

  if (!host) {
    console.warn("MessageBird webhook missing host");

    return new NextResponse("invalid webhook URL", {
      status: 401,
    });
  }

  const fullUrl = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const ok = isValid(sigHeader, tsHeader, fullUrl, rawBody);

  if (!ok) {
    console.warn("Invalid signature");

    return new NextResponse("invalid signature", {
      status: 401,
    });
  }

  let evt;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const payload = evt?.payload;
  let eventKey;
  if (evt?.event === "whatsapp.inbound" && payload?.id) {
    eventKey = `inbound:${payload.id}`;
  } else if (
    evt?.event === "whatsapp.interaction" &&
    payload?.type === "read" &&
    payload?.messageId
  ) {
    eventKey = `read:${payload.messageId}`;
  } else {
    eventKey = `raw:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
  }

  let recorded;
  try {
    recorded = await recordWebhookEvent({
      eventKey,
      eventType: evt?.event,
      payload: evt,
    });
  } catch (err) {
    console.error("Falha ao gravar evento do webhook do Bird", err);
    return NextResponse.json({ error: "temporarily unavailable" }, { status: 503 });
  }

  if (!recorded.inserted) {
    console.log("Evento repetido do Bird ignorado", eventKey);
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { id } = recorded;
  /*
   * O evento fica gravado antes do 200; repetições não voltam a ser processadas.
   * Se a gravação falhar, devolvemos 503 para o Bird repetir. O processamento
   * continua em segundo plano, com estado registado e falhas de estado só em log.
   */
  after(async () => {
    try {
      await markWebhookEventProcessing(id);
    } catch (err) {
      console.error("Falha ao marcar evento do Bird em processamento", err);
    }
    try {
      await handleEvent(rawBody);
      try {
        await markWebhookEventDone(id);
      } catch (err) {
        console.error("Falha ao marcar evento do Bird como concluído", err);
      }
    } catch (err) {
      console.error("MessageBird webhook failed", {
        message: err?.message,

        status: err?.status,

        type: err?.type,

        request_id: err?.request_id,
      });
      try {
        await markWebhookEventFailed(id, err?.message);
      } catch (stateError) {
        console.error("Falha ao marcar evento do Bird como falhado", stateError);
      }
    }
  });

  return NextResponse.json({
    ok: true,
  });
}

/* =========================================================
   MAIN WEBHOOK HANDLER
   ========================================================= */

async function handleEvent(rawJSON) {
  let evt;

  try {
    evt = JSON.parse(rawJSON);
  } catch {
    console.warn("Webhook - bad JSON");

    return;
  }

  /*
   * Read receipt.
   */
  const readInteraction = extractReadInteraction(evt);

  if (readInteraction) {
    await handleReadInteraction(readInteraction);

    return;
  }

  /*
   * Inbound WhatsApp text.
   */
  const isInboundText =
    evt.service === "channels" &&
    evt.event === "whatsapp.inbound" &&
    evt.payload?.body?.type === "text";
  const inboundReply = extractWhatsappQuickReply(evt.payload);
  const isInboundQuickReply =
    evt.service === "channels" &&
    evt.event === "whatsapp.inbound" &&
    inboundReply.isQuickReply;

  if (!isInboundText && !isInboundQuickReply) {
    return;
  }

  const identity = extractWhatsappIdentity(evt.payload);

  const contactId = identity.birdContactId;

  const text =
    inboundReply.isQuickReply && inboundReply.text
      ? inboundReply.text
      : evt.payload?.body?.text?.text ||
        evt.payload?.body?.text?.body ||
        (typeof evt.payload?.body?.text === "string"
          ? evt.payload.body.text
          : "");

  const sentChannelId =
    normalizeId(evt.payload?.channelId) ||
    normalizeId(evt.payload?.channel?.id) ||
    normalizeId(evt.payload?.receiver?.channel?.id);

  const inboundMsgId =
    normalizeId(evt.payload?.id) ||
    normalizeId(evt.payload?.messageId) ||
    normalizeId(evt.payload?.body?.id) ||
    normalizeId(evt.payload?.message?.id);

  /*
   * Security:
   *
   * We need the inbound channel to establish
   * which organization this webhook belongs to.
   */
  if (!sentChannelId) {
    console.warn("Inbound WhatsApp event missing channelId", {
      inboundMsgId,
      identity,
    });

    return;
  }

  if (!identity.phoneNumber && !identity.whatsappBsuid && !contactId) {
    console.warn("Inbound WhatsApp event missing usable identity", {
      identity,
      sentChannelId,
    });

    return;
  }

  /*
   * Resolve the organization exclusively
   * through the inbound Bird channel.
   */
  let channelOrganization;

  try {
    channelOrganization = await getOrganizationByChannelId(sentChannelId);
  } catch (err) {
    console.error("Could not resolve organization by channel_id", {
      sentChannelId,

      message: err?.message || String(err),
    });

    throw new Error("Could not resolve webhook organization");
  }

  if (!channelOrganization) {
    console.warn("Inbound WhatsApp channel has no organization", {
      sentChannelId,
    });

    return;
  }

  /*
   * Find the WhatsApp user scoped to the
   * channel organization.
   */
  let user = await findUserFromWhatsappIdentity(
    identity,
    channelOrganization.id,
  );

  if (user && Number(user.organization_id) !== Number(channelOrganization.id)) {
    throw new Error("Webhook user does not belong to channel organization");
  }

  if (user) {
    user = await updateUserWhatsappIdentity(user.id, identity);
  }

  /*
   * Unregistered user.
   */
  if (!user) {
    const response = await sendBirdMessage({
      channelId: sentChannelId,

      contactId,

      phoneNumber: identity.phoneNumber,

      whatsappBsuid: identity.whatsappBsuid,

      body: {
        type: "text",

        text: {
          text: "Este número não se encontra registado, por favor fale com os administradores.",
        },
      },
    });

    if (!response.ok) {
      console.error("Failed to send unregistered message:", response.data);
    }

    return;
  }

  /*
   * Pending outreach has priority over
   * normal AI conversation handling.
   */
  let pendingMessages = await getAllPendingOutreachByUser(user.id);
  const persistedOpeningGate = await getWhatsappOpeningGate({
    orgId: user.organization_id,
    userId: user.id,
  });
  const legacyOpeningGate = persistedOpeningGate
    ? null
    : findPendingOpeningGate(pendingMessages);
  const legacyReplyGate =
    !persistedOpeningGate &&
    inboundReply.isQuickReply &&
    inboundReply.replyToMessageId
      ? pendingMessages.find(
          (row) =>
            String(row.template_message_id || "") ===
            inboundReply.replyToMessageId,
        ) || null
      : null;
  const activeOpeningGate =
    persistedOpeningGate &&
    ["sending", "pending"].includes(persistedOpeningGate.status) &&
    Date.parse(persistedOpeningGate.expires_at) > Date.now()
      ? persistedOpeningGate
      : legacyReplyGate || legacyOpeningGate;

  if (activeOpeningGate) {
    const openingGateQueueRow = persistedOpeningGate?.pending_outreach_id
      ? pendingMessages.find(
          (row) =>
            String(row.id) ===
            String(persistedOpeningGate.pending_outreach_id),
        )
      : persistedOpeningGate
        ? null
        : legacyReplyGate || findPendingOpeningGate(pendingMessages);
    const gateForReply = {
      ...activeOpeningGate,
      template_message_id:
        activeOpeningGate.template_message_id ||
        openingGateQueueRow?.template_message_id ||
        null,
    };

    if (!isReplyToOpeningGate(inboundReply, gateForReply)) {
      await recordInboundDuringOpeningGate({
        user,
        inboundMsgId,
        contactId,
        inboundText: text,
      });
      console.log("WhatsApp opening gate is waiting for its Quick Reply", {
        userId: user.id,
        templateMessageId: gateForReply.template_message_id,
        inboundMsgId,
      });
      return;
    }

    if (persistedOpeningGate) {
      await recordInboundDuringOpeningGate({
        user,
        inboundMsgId,
        contactId,
        inboundText: text,
      });

      const acceptedGate = await acceptWhatsappOpeningGate({
        orgId: user.organization_id,
        userId: user.id,
        templateMessageId: gateForReply.template_message_id,
        replyMessageId: inboundMsgId,
      });

      if (!acceptedGate) {
        console.log("WhatsApp opening Quick Reply was already handled", {
          userId: user.id,
          templateMessageId: gateForReply.template_message_id,
          inboundMsgId,
        });
        return;
      }
    }

    // Inclui os envios que entraram na fila durante a aceitação do botão.
    pendingMessages = await getAllPendingOutreachByUser(user.id);

    if (Array.isArray(pendingMessages) && pendingMessages.length > 0) {
      await handlePendingMessages({
        user,
        inboundMsgId,
        contactId,
        inboundIdentity: identity,
        inboundText: text,
        pendingMessages,
        sentChannelId,
        inboundAlreadyRecorded: Boolean(persistedOpeningGate),
      });
    } else if (!persistedOpeningGate) {
      await recordInboundDuringOpeningGate({
        user,
        inboundMsgId,
        contactId,
        inboundText: text,
      });
    }

    return;
  }

  if (Array.isArray(pendingMessages) && pendingMessages.length > 0) {
    await handlePendingMessages({
      user,

      inboundMsgId,

      contactId,

      inboundIdentity: identity,

      inboundText: text,

      pendingMessages,

      sentChannelId,
    });

    return;
  }

  /*
   * Resolve organization from the user too,
   * and verify that it matches the inbound
   * Bird channel organization.
   */
  const organization = await getOrganization(user.organization_id);

  if (!organization) {
    console.warn("Organization not found for user", user.id);

    return;
  }

  if (Number(organization.id) !== Number(channelOrganization.id)) {
    throw new Error(
      "User organization does not match webhook channel organization",
    );
  }

  /*
   * =========================================================
   * TROCA DE ASSISTENTE
   * =========================================================
   *
   * Quem tem vários assistentes pede a lista com uma
   * palavra-chave e escolhe com quem quer falar. Vem
   * antes das perguntas para a palavra-chave não contar
   * como resposta a uma pergunta aberta.
   */
  const switchResult = await handleAssistantSwitch({
    user,

    payload: evt.payload,

    inboundMsgId,

    contactId,

    send: ({ text: menuText, actions, list }) =>
      sendBirdMessage({
        channelId: normalizeId(organization.channel_id) || sentChannelId,

        contactId,

        phoneNumber: identity.phoneNumber || user.phone_number,

        whatsappBsuid: identity.whatsappBsuid || user.whatsapp_bsuid,

        body: list
          ? {
              type: "list",

              list: {
                text: menuText,

                items: list.items,

                metadata: { button: { label: list.buttonLabel } },
              },
            }
          : {
              type: "text",

              text: {
                text: menuText,

                ...(actions?.length ? { actions } : {}),
              },
            },
      }),
  });

  if (switchResult.handled) {
    console.log("Assistant switch handled", {
      userId: user.id,

      inboundMsgId,

      ...switchResult,
    });

    return;
  }

  /*
   * =========================================================
   * QUIZ / PERGUNTA
   * =========================================================
   *
   * Um toque num botão de quiz (ou o texto de uma
   * opção) regista a resposta e envia o feedback.
   * Não passa pelo assistente. Só a primeira
   * resposta de cada contacto conta.
   */
  const questionResult = await handleQuestionReply({
    user,

    payload: evt.payload,

    inboundMsgId,

    contactId,

    organization,

    sendText: (replyText) =>
      sendBirdMessage({
        channelId: normalizeId(organization.channel_id) || sentChannelId,

        contactId,

        phoneNumber: identity.phoneNumber || user.phone_number,

        whatsappBsuid: identity.whatsappBsuid || user.whatsapp_bsuid,

        body: {
          type: "text",

          text: {
            text: replyText,
          },
        },
      }),

    resolveThread: async ({ question, message }) => {
      try {
        /*
         * A resposta fica com o assistente com que a pergunta foi
         * enviada, mesmo que o contacto tenha trocado entretanto.
         */
        const sentWithAssistantId = (user.assistant_ids || [])
          .map(Number)
          .includes(Number(message?.assistant_id))
          ? message.assistant_id
          : user.assistant_id;

        const assistant = await getAssistantFromUser(
          { ...user, assistant_id: sentWithAssistantId },
          organization,
        );

        if (!assistant) return null;

        let existingThread = await getUserThreadForChannel({
          userId: user.id,

          assistantId: assistant.id,

          channel: "whatsapp",
        });

        let conversationId = existingThread?.openai_conversation_id ?? null;
        if (question.kind === "open" && !conversationId) {
          try {
            const history = existingThread
              ? buildConversationHistoryItems(await getMessagesInThread(existingThread.id))
              : [];
            const conversation = await createConversation(
              {
                assistantId: assistant.id,
                organizationId: user.organization_id,
                userId: user.id,
                channel: "whatsapp",
                scope: "user",
              },
              history,
            );
            conversationId = conversation.id;
            existingThread = existingThread
              ? await setThreadConversationId(existingThread.id, conversationId)
              : await createThread({
                  userId: user.id,
                  assistantId: assistant.id,
                  openAiConversationId: conversationId,
                  channel: "whatsapp",
                  scope: "user",
                });
          } catch (error) {
            console.warn("Falha ao preparar a conversa da pergunta", {
              userId: user.id,
              error: error.message,
            });
            conversationId = null;
          }
        }

        return {
          threadId: existingThread?.id ?? null,
          assistantId: assistant.id,
          assistant,
          conversationId,
        };
      } catch {
        return null;
      }
    },
  });

  if (questionResult.handled) {
    console.log("Question reply handled", {
      userId: user.id,

      inboundMsgId,

      ...questionResult,
    });

    return;
  }

  /*
   * =========================================================
   * DATABASE ASSISTANT
   * =========================================================
   *
   * No assistant.open_ai_id.
   *
   * The Supabase Assistant row is now the
   * configuration used by Responses.
   */
  const assistantRow = await getAssistantFromUser(user, organization);

  if (!assistantRow) {
    console.warn("No assistants found for organization", organization.id);

    return;
  }

  if (!assistantRow.model) {
    throw new Error(`Assistant ${assistantRow.id} has no model configured`);
  }

  const channel = "whatsapp";

  /*
   * =========================================================
   * FIND DB THREAD
   * =========================================================
   */

  let thread = await getUserThreadForChannel({
    userId: user.id,

    assistantId: assistantRow.id,

    channel,
  });

  let conversationId = normalizeId(thread?.openai_conversation_id);

  /*
   * =========================================================
   * NEW THREAD
   * =========================================================
   */
  if (!thread) {
    const conversation = await createConversation({
      assistantId: assistantRow.id,

      organizationId: user.organization_id,

      userId: user.id,

      channel,

      scope: "user",
    });

    conversationId = normalizeId(conversation?.id);

    if (!conversationId) {
      throw new Error("OpenAI did not return a conversation ID");
    }

    thread = await createThread({
      userId: user.id,

      assistantId: assistantRow.id,

      /*
       * Legacy Assistants API field.
       *
       * New threads leave this NULL.
       */
      aiThreadId: null,

      /*
       * New Conversations API identifier.
       */
      openAiConversationId: conversationId,

      channel,

      scope: "user",

      externalConversationId: null,
    });

    console.log("Created new WhatsApp OpenAI Conversation", {
      userId: user.id,

      assistantId: assistantRow.id,

      dbThreadId: thread.id,

      conversationId,
    });
  } else if (!conversationId) {

  /*
   * =========================================================
   * LEGACY THREAD MIGRATION
   * =========================================================
   *
   * Existing DB row:
   *
   * ai_thread_id = thread_...
   * openai_conversation_id = NULL
   *
   * We preserve the old ID but stop using it.
   */
    const previousMessages = await getMessagesInThread(thread.id);

    const historyItems = buildConversationHistoryItems(previousMessages);

    const conversation = await createConversation(
      {
        assistantId: assistantRow.id,

        organizationId: user.organization_id,

        userId: user.id,

        channel,

        scope: "user",

        migratedFromDbThreadId: thread.id,
      },

      historyItems,
    );

    conversationId = normalizeId(conversation?.id);

    if (!conversationId) {
      throw new Error(
        `Could not migrate DB thread ${thread.id} to an OpenAI Conversation`,
      );
    }

    thread = await setThreadConversationId(thread.id, conversationId);

    console.log("Migrated legacy WhatsApp thread to OpenAI Conversation", {
      userId: user.id,

      assistantId: assistantRow.id,

      dbThreadId: thread.id,

      legacyAiThreadId: thread.ai_thread_id || null,

      conversationId,

      migratedMessages: historyItems.length,
    });
  }

  /*
   * Should never happen after the code above.
   */
  if (!conversationId) {
    throw new Error(
      `DB thread ${thread?.id ?? "unknown"} has no OpenAI Conversation ID`,
    );
  }

  /*
   * IMPORTANT:
   *
   * Save the incoming message AFTER legacy
   * history migration.
   *
   * Otherwise the current message would be
   * added to initial Conversation history
   * and then sent again as the new Response
   * input.
   */
  await createMessage({
    threadId: thread.id,

    userId: user.id,

    organizationId: user.organization_id,

    assistantId: assistantRow.id,

    channel,

    messageId: inboundMsgId,

    externalContactId: contactId,

    content: text,

    role: "user",
  });

  await recordSystemAuditEvent(user.organization_id, {
    action: AUDIT_ACTIONS.MESSAGE_RECEIVED,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    details: { channel },
  });

  /*
   * =========================================================
   * RESPONSES API
   * =========================================================
   *
   * Removed:
   *
   * assistant.open_ai_id
   * createOAiThread()
   * sendMessageToAi()
   * beta.threads
   * Runs
   * polling
   */
  const aiResponse = await generateAssistantResponse({
    assistant: assistantRow,

    conversationId,

    message: text,
  });

  const aiText = String(aiResponse?.aiResponse || "").trim();

  if (!aiText) {
    throw new Error("OpenAI returned an empty assistant response");
  }

  /*
   * Send AI response through Bird.
   */
  let outboundId = null;

  const outgoingChannelId =
    normalizeId(organization.channel_id) || sentChannelId;

  const sendRes = await sendBirdMessage({
    channelId: outgoingChannelId,

    contactId,

    phoneNumber: identity.phoneNumber || user.phone_number,

    whatsappBsuid: identity.whatsappBsuid || user.whatsapp_bsuid,

    body: {
      type: "text",

      text: {
        text: aiText,
      },
    },
  });

  if (!sendRes.ok) {
    console.error("Failed to send assistant message:", sendRes.data);
  } else {
    outboundId = sendRes.providerMessageId;
  }

  /*
   * Save Assistant response locally.
   */
  await createMessage({
    threadId: thread.id,

    userId: user.id,

    organizationId: user.organization_id,

    assistantId: assistantRow.id,

    channel,

    messageId: outboundId,

    externalContactId: contactId,

    content: aiText,

    role: "assistant",

    deliveryStatus: sendRes.ok ? "accepted" : "failed",

    failedAt: sendRes.ok ? null : new Date().toISOString(),
  });
}

/* =========================================================
   PENDING OUTREACH
   ========================================================= */

async function handlePendingMessages({
  user,
  inboundMsgId,
  contactId,
  inboundIdentity,
  inboundText,
  pendingMessages,
  sentChannelId,
  inboundAlreadyRecorded = false,
}) {
  /*
   * A conversa do contacto, para a resposta e as mensagens entregues
   * aparecerem no histórico. Pode não existir ainda.
   */
  const thread = await getLatestUserThreadForChannel(
    user.id,
    "whatsapp",
  ).catch(() => null);

  if (!inboundAlreadyRecorded) {
    await createMessage({
      threadId: thread?.id ?? null,

      userId: user.id,

      organizationId: user.organization_id,

      assistantId: user.assistant_id ?? null,

      channel: "whatsapp",

      messageId: inboundMsgId,

      externalContactId: contactId,

      content: inboundText,

      role: "user",
    });
  }

  const organization = await getOrganization(user.organization_id);

  if (!organization) {
    console.warn("Organization not found while sending pending outreach");

    return;
  }

  const outgoingChannelId =
    normalizeId(organization.channel_id) || normalizeId(sentChannelId);

  for (const row of pendingMessages) {
    if (!(await claimPendingOutreach(row.id, inboundMsgId))) continue;
    const p = safePayload(row.payload);

    const hasImages = Array.isArray(p.imageUrls) && p.imageUrls.length > 0;

    const hasText = Boolean(String(p.message || "").trim());

    /*
     * Quiz em espera: a mensagem leva os botões
     * de resposta rápida.
     */
    const actions =
      Array.isArray(p.actions) && p.actions.length > 0 ? p.actions : null;

    if (!hasImages && !hasText) {
      console.warn("Skipping empty pending outreach", {
        pendingOutreachId: row.id,

        userId: user.id,
      });

      await markPendingOutreachReplied(row.id, inboundMsgId);

      continue;
    }

    /*
     * Os botões vão em `actions` também na mensagem de imagem: o Bird
     * entrega imagem, texto e botões numa só mensagem (verificado a
     * 15-09-2026).
     */
    const body = hasImages
      ? {
          type: "image",

          image: {
            images: p.imageUrls.map((u) => ({
              mediaUrl: u,
            })),

            ...(hasText
              ? {
                  text: p.message,
                }
              : {}),

            ...(actions ? { actions } : {}),
          },
        }
      : {
          type: "text",

          text: {
            text: p.message || "",

            ...(actions ? { actions } : {}),
          },
        };

    const sendRes = await sendBirdMessage({
      channelId: outgoingChannelId,

      contactId,

      phoneNumber: inboundIdentity?.phoneNumber || user.phone_number,

      whatsappBsuid: inboundIdentity?.whatsappBsuid || user.whatsapp_bsuid,

      body,
    });

    if (!sendRes.ok) {
      console.error("Failed to send pending outreach:", {
        pendingOutreachId: row.id,

        status: sendRes.status,

        data: sendRes.data,
      });

      await releasePendingOutreach(row.id);
      break;
    }

    const outboundId = sendRes.providerMessageId;

    /*
     * Balões à parte de uma mensagem com vários links: saem a seguir à
     * mensagem, um de cada vez. Um que falhe não impede os seguintes.
     */
    for (const followUpBody of followUpBodies(p.followUps)) {
      const followUpRes = await sendBirdMessage({
        channelId: outgoingChannelId,
        contactId,
        phoneNumber: inboundIdentity?.phoneNumber || user.phone_number,
        whatsappBsuid: inboundIdentity?.whatsappBsuid || user.whatsapp_bsuid,
        body: followUpBody,
      });

      if (!followUpRes.ok) {
        console.warn("Failed to send pending outreach follow-up", {
          pendingOutreachId: row.id,
          status: followUpRes.status,
          data: followUpRes.data,
        });
      }
    }

    const hasChainMetadata =
      row.message_chain_id &&
      row.message_chain_step_id &&
      row.message_chain_recipient_id &&
      row.message_chain_step_index;

    /*
     * Security:
     *
     * Validate the chain, step and recipient
     * against the user + organization before
     * persisting any chain metadata.
     */
    const chainContext = hasChainMetadata
      ? await getValidatedMessageChainContext({
          chainId: row.message_chain_id,

          chainStepId: row.message_chain_step_id,

          chainRecipientId: row.message_chain_recipient_id,

          stepIndex: Number(row.message_chain_step_index),

          userId: user.id,

          organizationId: user.organization_id,
        })
      : null;

    await createMessage({
      threadId: thread?.id ?? null,

      userId: user.id,

      organizationId: user.organization_id,

      assistantId: thread?.assistant_id ?? user.assistant_id ?? null,

      channel: "whatsapp",

      messageId: outboundId,

      externalContactId: contactId,

      content: p.message || "",

      role: "assistant",

      deliveryStatus: "accepted",

      questionId: p.questionId ?? null,

      messageChainId: chainContext?.chain.id || null,

      messageChainStepId: chainContext?.step.id || null,

      messageChainRecipientId: chainContext?.recipient.id || null,

      messageChainStepIndex: chainContext
        ? Number(row.message_chain_step_index)
        : null,
    });

    if (chainContext) {
      try {
        await createMessageChainDelivery({
          chainId: chainContext.chain.id,

          chainStepId: chainContext.step.id,

          chainRecipientId: chainContext.recipient.id,

          userId: user.id,

          stepIndex: Number(row.message_chain_step_index),

          providerMessageId: outboundId,

          status: "sent",

          sentAt: new Date().toISOString(),
        });

        await updateMessageChainRecipientProgress({
          chainId: chainContext.chain.id,

          chainRecipientId: chainContext.recipient.id,

          userId: user.id,

          currentStepIndex: Number(row.message_chain_step_index),

          status: "active",
        });

        console.log("Pending outreach chain step sent", {
          pendingOutreachId: row.id,

          chainId: row.message_chain_id,

          chainStepId: row.message_chain_step_id,

          chainRecipientId: row.message_chain_recipient_id,

          stepIndex: row.message_chain_step_index,

          providerMessageId: outboundId,
        });
      } catch (err) {
        console.error("Failed to update chain state for pending outreach", {
          pendingOutreachId: row.id,

          chainId: row.message_chain_id,

          stepIndex: row.message_chain_step_index,

          error: err?.message || String(err),
        });
      }
    }

    await markPendingOutreachReplied(row.id, inboundMsgId);
  }
}

async function recordInboundDuringOpeningGate({
  user,
  inboundMsgId,
  contactId,
  inboundText,
}) {
  const thread = await getLatestUserThreadForChannel(
    user.id,
    "whatsapp",
  ).catch(() => null);

  await createMessage({
    threadId: thread?.id ?? null,
    userId: user.id,
    organizationId: user.organization_id,
    assistantId: thread?.assistant_id ?? user.assistant_id ?? null,
    channel: "whatsapp",
    messageId: inboundMsgId,
    externalContactId: contactId,
    content: inboundText,
    role: "user",
  });
}

/* =========================================================
   ASSISTANT RESOLUTION
   ========================================================= */

async function getAssistantFromUser(user, organization) {
  const admin = getSupabaseAdminClient();

  /*
   * If the user has an explicitly assigned
   * Assistant, verify that Assistant belongs
   * to the user's organization before using it.
   */
  if (user.assistant_id) {
    await assertAssistantBelongsToOrg(
      admin,
      organization.id,
      user.assistant_id,
    );

    const assistant = await getAssistantById(user.assistant_id);

    if (assistant) {
      return assistant;
    }
  }

  /*
   * Fallback to an Assistant from the same
   * organization.
   */
  const assistants = await getAssistantsInOrg(organization.id);

  if (!assistants?.length) {
    return null;
  }

  return assistants[0];
}
