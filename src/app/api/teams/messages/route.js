// /src/app/api/teams/messages/route.js

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  getAssistantById,
  getFirstAssistantInOrg,
} from "@/lib/repos/assistants.repo";

import {
  createConversation,
  generateAssistantResponse,
} from "@/lib/services/openaiResponses.service";

import { getOrganizationByTeamsTenantId } from "@/lib/repos/organizations.repo";

import {
  createMessage,
  getMessagesInThread,
  getRecentQuestionMessagesForUser,
  markTeamsMessagesReadUpTo,
} from "@/lib/repos/messages.repo";

import { handleQuestionReply } from "@/lib/services/questions/handleQuestionReply";

import {
  linkTeamsUserByEmail,
  savePendingTeamsInstallation,
  upsertPersonalInstallation,
} from "@/lib/services/teams/teamsConnection";

import { extractTeamsReply } from "@/lib/teams/questionCard";

import {
  handleTeamsAssistantSwitch,
  isSwitchCommand,
} from "@/lib/services/teams/teamsAssistantSwitch";

import { recordSystemAuditEvent } from "@/lib/services/audit/recordAuditEvent";

import { processReadChainAfterRead } from "@/lib/services/broadcast/readChains/processReadChainAfterRead";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

import {
  getUserByAadObjectId,
  getUserByEmail,
  getUserById,
  updateUser,
} from "@/lib/repos/user.repo";

import {
  createThread,
  getUserThreadForChannel,
  getGroupThreadForConversation,
  setThreadConversationId,
} from "@/lib/repos/threads.repo";

import {
  upsertTeamsInstallation,
  getTeamsInstallationByConversation,
  getGroupInstallationForConversation,
  deactivateGroupInstallation,
} from "@/lib/repos/teamsInstallations.repo";

import { sendReply } from "@/lib/teams/sendReply";
import { stripBotMention } from "@/lib/teams/mentions";
import { getChannelPostContext } from "@/lib/services/teams/channelPostContext";
import { getTeamName } from "@/lib/teams/members";

import { handleApiError, requireValidTeamsRequest } from "@/lib/auth/guards";

/* =========================================================
   ORGANIZATION SECURITY
   ========================================================= */

function userBelongsToOrganization(user, organizationId) {
  if (!user || !organizationId) {
    return false;
  }

  return Number(user.organization_id) === Number(organizationId);
}

function assistantBelongsToOrganization(assistant, organizationId) {
  if (!assistant || !organizationId) {
    return false;
  }

  const assistantOrganizationId =
    assistant.organization_id ?? assistant.org_id ?? null;

  return Number(assistantOrganizationId) === Number(organizationId);
}

async function getTeamsUserForOrganization({ aadObjectId, organizationId }) {
  if (!aadObjectId || !organizationId) {
    return null;
  }

  const user = await getUserByAadObjectId(aadObjectId);

  if (!user) {
    return null;
  }

  if (!userBelongsToOrganization(user, organizationId)) {
    console.warn("[TEAMS] AAD user organization mismatch", {
      aadObjectId,

      expectedOrganizationId: organizationId,

      actualOrganizationId: user.organization_id,

      userId: user.id,
    });

    return null;
  }

  return user;
}

async function assertAssistantMatchesOrganization(assistant, organizationId) {
  if (!assistantBelongsToOrganization(assistant, organizationId)) {
    const error = new Error(
      "Assistant does not belong to the Teams organization",
    );

    error.status = 403;

    throw error;
  }

  return assistant;
}

/* =========================================================
   SEND TEAMS REPLY
   ========================================================= */



const NOT_REGISTERED_TEXT =
  "Ainda não estás registado na MyDigitalBot.<br>Pede ao administrador da tua empresa para te adicionar com o email da tua conta Microsoft. Assim que o fizer, ficas ligado automaticamente.";

/*
 * Someone the bot does not know yet (#153): link them
 * by their Microsoft email, or keep the installation
 * until the admin adds them with that email.
 */
async function resolveUnknownTeamsUser(activity, org) {
  const context = {
    organization: org,

    tenantId: GetTenantId(activity),

    aadObjectId: GetAadObjectId(activity),

    teamsUserId: GetFromId(activity),

    serviceUrl: activity?.serviceUrl ?? null,

    conversationId: activity?.conversation?.id ?? null,

    conversationType: GetConversationType(activity),
  };

  if (context.conversationType !== "personal" || !context.aadObjectId) {
    return null;
  }

  const result = await linkTeamsUserByEmail(context);

  if (result.linked) return result.user;

  console.log("[TEAMS] Could not link by email", { reason: result.reason });

  await savePendingTeamsInstallation(context);

  return null;
}

/* =========================================================
   COMMANDS
   ========================================================= */

async function cmdWhoAmI(activity) {
  const tenantId = GetTenantId(activity);

  const aadObjectId = GetAadObjectId(activity);

  const fromId = GetFromId(activity);

  return [
    `Tenant ID: ${tenantId || "-"}`,
    `From Id: ${fromId || "-"}`,
    `Aad Object Id: ${aadObjectId || "-"}`,
  ].join("<br>");
}

async function cmdConnect(activity) {
  const tenantId = GetTenantId(activity);

  const aadObjectId = GetAadObjectId(activity);

  const fromId = GetFromId(activity);

  const conversationId = activity?.conversation?.id ?? null;

  const serviceUrl = activity?.serviceUrl ?? null;

  const conversationType = GetConversationType(activity);

  if (!tenantId) {
    return "The Tenant Id couldn't be detected. Please try again or contact support.";
  }

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    return "Your organization isn't registered in MyDigitalBot.com. Ask your admin or register it first.";
  }

  if (!aadObjectId || !fromId || !conversationId || !serviceUrl) {
    return [
      "I'm missing required data to connect your account",
      `AAD Object ID: ${aadObjectId || "-"}`,
      `Teams User ID: ${fromId || "-"}`,
      `Conversation ID: ${conversationId || "-"}`,
      `ServiceUrl: ${serviceUrl || "-"}`,
    ].join("<br>");
  }

  const user = await getTeamsUserForOrganization({
    aadObjectId,
    organizationId: org.id,
  });

  if (!user) {
    return [
      "You're not linked to a MyDigitalBot user in this organization.",
      "Send this to your admin so they can check the account:",
      `Tenant ID: ${tenantId}`,
      `AAD Object ID: ${aadObjectId}`,
    ].join("<br>");
  }

  const assistant = await getAssistantById(user.assistant_id);

  await assertAssistantMatchesOrganization(assistant, org.id);

  await upsertPersonalInstallation({
    organization_id: org.id,

    assistant_id: assistant.id,

    scope: "user",

    user_id: user.id,

    tenant_id: tenantId,

    service_url: serviceUrl,

    conversation_id: conversationId,

    conversation_type: conversationType,

    teams_user_id: fromId,

    last_seen_at: new Date().toISOString(),
  });

  await updateUser(user.id, {
    teamsFromId: fromId,
  }).catch(() => {});

  return "Connected! You can now use the bot normally";
}

async function cmdCreateUser(args, activity) {
  const tenantId = GetTenantId(activity);

  const aadObjectId = GetAadObjectId(activity);

  const fromId = GetFromId(activity);

  const conversationId = activity?.conversation?.id ?? null;

  const serviceUrl = activity?.serviceUrl ?? null;

  const conversationType = GetConversationType(activity);

  const email = Array.isArray(args)
    ? (args[0] || "").trim()
    : String(args || "").trim();

  if (!tenantId) {
    return "Couldn't read the Tenant ID from this message.";
  }

  if (!email) {
    return "Usage: --register email@example.com";
  }

  if (!aadObjectId || !fromId) {
    return "I don't have access to your Teams IDs right now.";
  }

  if (!conversationId || !serviceUrl) {
    return "Missing conversationId/serviceUrl. Try again in a 1:1 chat.";
  }

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    return "Your organization isn't registered in MyDigitalBot.com. Ask your admin.";
  }

  /*
   * Already linked Teams account.
   */
  const existingByAad = await getUserByAadObjectId(aadObjectId);

  if (existingByAad) {
    if (!userBelongsToOrganization(existingByAad, org.id)) {
      return (
        "This Teams account is already linked " +
        "to a user in another organization. " +
        "Ask your administrator to correct the link."
      );
    }

    const assistant = await getAssistantById(existingByAad.assistant_id);

    await assertAssistantMatchesOrganization(assistant, org.id);

    await upsertPersonalInstallation({
      organization_id: org.id,

      assistant_id: assistant.id,

      scope: "user",

      user_id: existingByAad.id,

      tenant_id: tenantId,

      service_url: serviceUrl,

      conversation_id: conversationId,

      conversation_type: conversationType,

      teams_user_id: fromId,

      last_seen_at: new Date().toISOString(),
    });

    await updateUser(existingByAad.id, {
      teamsFromId: fromId,
    }).catch(() => {});

    return (
      "Obrigado por se registar na MyDigitalBot.<br>" +
      "Agora poderás receber comunicações da Empresa e " +
      "interagir com o teu Assistente Virtual."
    );
  }

  /*
   * Existing DB account.
   */
  let userRefByEmail = null;

  try {
    userRefByEmail = await getUserByEmail(email, tenantId);
  } catch (error) {
    if (error.code === "AMBIGUOUS_EMAIL_TENANT") {
      return (
        `Este email: ${email} já existe em duplicado ` +
        "na aplicação, por favor pede ao administrador " +
        "para remover os duplicados."
      );
    }

    throw error;
  }

  const userIdByEmail =
    typeof userRefByEmail === "object" ? userRefByEmail?.id : userRefByEmail;

  if (userIdByEmail) {
    const fullUser = await getUserById(userIdByEmail);

    if (!userBelongsToOrganization(fullUser, org.id)) {
      return (
        "The email belongs to a user in another organization. " +
        "Ask your administrator to correct the account."
      );
    }

    const assistant = await getAssistantById(fullUser.assistant_id);

    await assertAssistantMatchesOrganization(assistant, org.id);

    /*
     * Security:
     *
     * Don't allow somebody to claim another
     * existing account just by knowing its email.
     */
    const alreadyLinked = await getUserByAadObjectId(aadObjectId);

    if (!alreadyLinked || Number(alreadyLinked.id) !== Number(userIdByEmail)) {
      return (
        "For security, an existing account can only be connected after " +
        "an administrator has linked this Teams identity to it."
      );
    }

    await updateUser(userIdByEmail, {
      teamsAadObjectId: aadObjectId,

      teamsFromId: fromId,
    });

    await upsertPersonalInstallation({
      organization_id: org.id,

      assistant_id: assistant.id,

      scope: "user",

      user_id: userIdByEmail,

      tenant_id: tenantId,

      service_url: serviceUrl,

      conversation_id: conversationId,

      conversation_type: conversationType,

      teams_user_id: fromId,

      last_seen_at: new Date().toISOString(),
    });

    return (
      `Conta encontrada para ${email}. ` + "Teams ligado e conversa conectada."
    );
  }

  /*
   * Do NOT create arbitrary users through
   * the public Teams bot.
   */
  return (
    "No pre-provisioned account was found. Ask an administrator to " +
    "create the account and link this Teams identity before registering."
  );
}

async function cmdReconnect(args, activity) {
  const tenantId = GetTenantId(activity);

  const aadObjectId = GetAadObjectId(activity);

  const fromId = GetFromId(activity);

  const conversationId = activity?.conversation?.id ?? null;

  const serviceUrl = activity?.serviceUrl ?? null;

  const conversationType = GetConversationType(activity);

  const email = Array.isArray(args)
    ? (args[0] || "").trim()
    : String(args || "").trim();

  if (!tenantId) {
    return "Couldn't read the Tenant ID from this message.";
  }

  if (!email) {
    return "Usage: --reconnect email@example.com";
  }

  if (!aadObjectId || !fromId) {
    return "I don't have access to your Teams IDs right now.";
  }

  if (!conversationId || !serviceUrl) {
    return "Missing conversationId/serviceUrl. Try again in a 1:1 chat.";
  }

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    return "Your organization isn't registered in MyDigitalBot.com.";
  }

  let userRef;

  try {
    userRef = await getUserByEmail(email, tenantId);
  } catch (error) {
    if (error.code === "AMBIGUOUS_EMAIL_TENANT") {
      return "That email exists multiple times in this tenant. Ask your admin to fix duplicates.";
    }

    throw error;
  }

  const userId = typeof userRef === "object" ? userRef?.id : userRef;

  if (!userId) {
    return `No user found for ${email} in this tenant.`;
  }

  const fullUser = await getUserById(userId);

  if (!userBelongsToOrganization(fullUser, org.id)) {
    return (
      "The selected user does not belong to this organization. " +
      "Ask your administrator to correct the account."
    );
  }

  const alreadyLinked = await getUserByAadObjectId(aadObjectId);

  if (!alreadyLinked || String(alreadyLinked.id) !== String(userId)) {
    return (
      "For security, an administrator must link this Teams identity " +
      "to the requested account before reconnecting it."
    );
  }

  const assistant = await getAssistantById(fullUser.assistant_id);

  await assertAssistantMatchesOrganization(assistant, org.id);

  await updateUser(userId, {
    teamsAadObjectId: aadObjectId,

    teamsFromId: fromId,
  });

  await upsertPersonalInstallation({
    organization_id: org.id,

    assistant_id: assistant.id,

    scope: "user",

    user_id: userId,

    tenant_id: tenantId,

    service_url: serviceUrl,

    conversation_id: conversationId,

    conversation_type: conversationType,

    teams_user_id: fromId,

    last_seen_at: new Date().toISOString(),
  });

  return `Linked Teams to ${email} and connected this conversation.`;
}

async function CheckForCommandMessage(activity) {
  const message =
    typeof activity?.text === "string" ? activity.text.trim() : "";

  if (!message) {
    return {
      isCommand: false,
    };
  }

  const hasCommand = message.match(
    /^(--|\/|!)([a-z][\w-]*)(?:\s+(.+)|=(.+))?$/i,
  );

  if (!hasCommand) {
    return {
      isCommand: false,
    };
  }

  const name = hasCommand[2].toLowerCase();

  const argString = (hasCommand[3] ?? hasCommand[4] ?? "").trim();

  const args = argString ? argString.split(/\s+/) : [];

  return {
    isCommand: true,

    command: name,

    argString,

    args,
  };
}

async function CheckCommands(cmd, activity) {
  switch (cmd.command) {
    case "help":
      return `--help: Lista de Comandos<br>--status: Verificar o estado do MyDigitalBot<br>--whoami: Mostra os teus IDs do Teams<br>--assistentes: Trocar de assistente<br>--reconnect: Voltar a ligar ao banco de dados<br>--register email@example.com: Registo na MyDigitalBot, escrevendo o comando e de seguida o endereço de e-mail`;

    case "status":
      return "Bot is active";

    case "whoami":
      return await cmdWhoAmI(activity);

    case "connect":
      return await cmdConnect(activity);

    case "register":
      return await cmdCreateUser(cmd.args, activity);

    case "reconnect":
      return await cmdReconnect(cmd.args, activity);

    case "send":
      return `Bem-vindo à aplicação MyDigitalBot.<br>Para começares a usar a aplicação, regista-te escrevendo --register e depois o teu email.<br>Exemplo: --register nome@email.pt<br>Para mais opções, escreve --help`;

    default:
      return `Comando desconhecido: ${cmd.command}<br>Tenta --help`;
  }
}

/* =========================================================
   OPENAI CONVERSATIONS
   ========================================================= */

function normalizeId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const str = String(value).trim();

  return str.length ? str : null;
}

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

async function ensureTeamsConversation({
  thread,
  userId,
  assistant,
  organizationId,
  channel,
  scope,
  externalConversationId,
  initialItems = [],
}) {
  let currentThread = thread;

  let conversationId = normalizeId(currentThread?.openai_conversation_id);

  /*
   * =========================================================
   * BRAND NEW THREAD
   * =========================================================
   */
  if (!currentThread) {
    const conversation = await createConversation(
      {
        assistantId: assistant.id,

        organizationId,

        userId,

        channel,

        scope,

        externalConversationId,
      },

      initialItems,
    );

    conversationId = normalizeId(conversation?.id);

    if (!conversationId) {
      throw new Error("OpenAI did not return a Conversation ID");
    }

    currentThread = await createThread({
      userId,

      assistantId: assistant.id,

      /*
       * Legacy Assistants API field.
       */
      aiThreadId: null,

      /*
       * New Responses/Conversations field.
       */
      openAiConversationId: conversationId,

      channel,

      scope,

      externalConversationId,
    });

    return {
      thread: currentThread,

      conversationId,
    };
  }

  /*
   * =========================================================
   * ALREADY MIGRATED
   * =========================================================
   */
  if (conversationId) {
    return {
      thread: currentThread,

      conversationId,
    };
  }

  /*
   * =========================================================
   * LEGACY ASSISTANTS API THREAD
   * =========================================================
   *
   * ai_thread_id = thread_...
   * openai_conversation_id = NULL
   */
  const previousMessages = await getMessagesInThread(currentThread.id);

  const historyItems = buildConversationHistoryItems(previousMessages);

  const conversation = await createConversation(
    {
      assistantId: assistant.id,

      organizationId,

      userId,

      channel,

      scope,

      externalConversationId,

      migratedFromDbThreadId: currentThread.id,
    },

    historyItems,
  );

  conversationId = normalizeId(conversation?.id);

  if (!conversationId) {
    throw new Error(
      `Could not migrate Teams thread ${currentThread.id} to an OpenAI Conversation`,
    );
  }

  currentThread = await setThreadConversationId(
    currentThread.id,
    conversationId,
  );

  console.log("[TEAMS] Migrated legacy thread to Conversation", {
    dbThreadId: currentThread.id,

    legacyAiThreadId: currentThread.ai_thread_id ?? null,

    conversationId,

    migratedMessages: historyItems.length,
  });

  return {
    thread: currentThread,

    conversationId,
  };
}

/* =========================================================
   NORMAL USER MESSAGE
   ========================================================= */

async function handleUserInteraction(activity) {
  const cmd = await CheckForCommandMessage(activity);

  /* --assistentes needs the user, so it goes on below (#155). */
  if (cmd.isCommand && !isSwitchCommand(cmd.command)) {
    const text = await CheckCommands(cmd, activity);

    await sendReply(activity, text);

    return;
  }

  const tenantId = GetTenantId(activity);

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    await sendReply(
      activity,
      "Parece que o teu tenant não está registado e por causa disso não consegues utilizar este serviço.<br>Por favor vai a MyDigitalBot.com e regista a tua organização.",
    );

    return;
  }

  const aadObjectId = GetAadObjectId(activity);

  const teamsConversationId = activity?.conversation?.id ?? null;

  const conversationType = GetConversationType(activity);

  const message =
    typeof activity?.text === "string" ? activity.text.trim() : "";

  if (!aadObjectId || !teamsConversationId || !message) {
    await sendReply(activity, "Invalid Teams message.");

    return;
  }

  /*
   * Resolve the user ONLY inside the tenant's
   * organization.
   */
  const user =
    (await getTeamsUserForOrganization({
      aadObjectId,
      organizationId: org.id,
    })) || (await resolveUnknownTeamsUser(activity, org));

  if (!user) {
    await sendReply(activity, NOT_REGISTERED_TEXT);

    return;
  }

  /*
   * Assistant switch (#155): the "assistentes"
   * keyword, the --assistentes command or a tap
   * on the menu card. Personal chats only; a
   * group uses the assistant of its installation.
   */
  if (conversationType === "personal") {
    const switchResult = await handleTeamsAssistantSwitch({
      userId: user.id,

      text: message,

      value: activity?.value ?? null,

      isCommand: cmd.isCommand,

      send: ({ text, attachments }) =>
        sendReply(activity, text ?? "", { attachments }),
    });

    if (switchResult.handled) return;
  } else if (cmd.isCommand) {
    await sendReply(
      activity,
      "A troca de assistente só está disponível na conversa privada com o bot.",
    );

    return;
  }

  const channel = "teams";

  let assistantId = null;

  /*
   * Personal conversation:
   *
   * Assistant assigned to the user.
   */
  if (conversationType === "personal") {
    assistantId = user.assistant_id;
  } else {
    /*
     * Group/channel:
     *
     * Use the Assistant stored on this Teams
     * installation.
     */
    const installation = await getGroupInstallationForConversation({
      tenantId,

      conversationId: teamsConversationId,

      teamId: activity?.channelData?.team?.id ?? null,
    });

    if (
      installation &&
      installation.organization_id != null &&
      Number(installation.organization_id) !== Number(org.id)
    ) {
      const error = new Error(
        "Teams installation does not belong to this organization",
      );

      error.status = 403;

      throw error;
    }

    assistantId = installation?.assistant_id ?? null;

    /*
     * Existing installations should have an
     * Assistant. This fallback also keeps old
     * installations working during migration.
     */
    if (!assistantId) {
      const fallbackAssistant = await getFirstAssistantInOrg(org.id);

      assistantId = fallbackAssistant?.id ?? null;
    }
  }

  if (!assistantId) {
    throw new Error("No assistant is assigned to this Teams conversation");
  }

  /*
   * Supabase Assistant row.
   *
   * No OpenAI Assistant object exists anymore.
   */
  const assistant = await getAssistantById(assistantId);

  await assertAssistantMatchesOrganization(assistant, org.id);

  if (!assistant.model) {
    throw new Error(`Assistant ${assistant.id} has no model configured`);
  }

  /*
   * =========================================================
   * DB THREAD
   * =========================================================
   */
  let thread = null;

  let scope = null;

  if (conversationType === "personal") {
    scope = "user";

    thread = await getUserThreadForChannel({
      userId: user.id,

      assistantId: assistant.id,

      channel,
    });
  } else {
    scope = "group";

    thread = await getGroupThreadForConversation({
      assistantId: assistant.id,

      channel,

      externalConversationId: teamsConversationId,
    });
  }

  /*
   * Existing thread must belong to the same
   * Assistant.
   */
  if (thread && Number(thread.assistant_id) !== Number(assistant.id)) {
    const error = new Error("Thread does not belong to the selected assistant");

    error.status = 403;

    throw error;
  }

  if (thread && scope === "group" && thread.scope && thread.scope !== "group") {
    const error = new Error(
      "Teams group conversation resolved to a non-group thread",
    );

    error.status = 409;

    throw error;
  }

  /*
   * =========================================================
   * RESPONSES API CONVERSATION
   * =========================================================
   */
  const ensured = await ensureTeamsConversation({
    thread,

    userId: scope === "user" ? user.id : null,

    assistant,

    organizationId: org.id,

    channel,

    scope,

    externalConversationId: teamsConversationId,

    /* Fio novo num canal: começa com a publicação da plataforma. */
    initialItems:
      !thread && scope === "group"
        ? await getChannelPostContext({
            conversationId: teamsConversationId,

            organizationId: org.id,
          })
        : [],
  });

  thread = ensured.thread;

  const openAiConversationId = ensured.conversationId;

  if (!openAiConversationId) {
    throw new Error(
      `Teams thread ${thread?.id ?? "unknown"} has no OpenAI Conversation ID`,
    );
  }

  /*
   * Validate again after a new thread may
   * have been created.
   */
  if (Number(thread.assistant_id) !== Number(assistant.id)) {
    const error = new Error("Thread does not belong to the selected assistant");

    error.status = 403;

    throw error;
  }

  if (scope === "group" && thread.scope && thread.scope !== "group") {
    const error = new Error(
      "Teams group conversation resolved to a non-group thread",
    );

    error.status = 409;

    throw error;
  }

  /*
   * Quiz, survey or open question (#151): the
   * answer is recorded and gets its feedback
   * without going to the assistant.
   */
  if (scope === "user") {
    const questionResult = await handleTeamsQuestionReply({
      activity,

      user,

      org,

      assistant,

      thread,

      conversationId: openAiConversationId,
    });

    if (questionResult.handled) return;
  }

  /*
   * Save incoming Teams message locally.
   */
  await createMessage({
    threadId: thread.id,

    userId: user.id,

    organizationId: org.id,

    assistantId: assistant.id,

    channel,

    messageId: activity.id ?? null,

    externalContactId: activity?.from?.id ?? null,

    content: message,

    role: "user",
  });

  await recordSystemAuditEvent(org.id, {
    action: AUDIT_ACTIONS.MESSAGE_RECEIVED,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.name,
    details: { channel, scope },
  });

  /*
   * =========================================================
   * RESPONSES API
   * =========================================================
   *
   * No:
   *
   * createOAiThread()
   * sendMessageToAi()
   * assistant.open_ai_id
   * beta.threads
   * runs
   * polling
   */
  const aiResponse = await generateAssistantResponse({
    assistant,

    conversationId: openAiConversationId,

    message,
  });

  const text = String(aiResponse?.aiResponse ?? "").trim();

  if (!text) {
    throw new Error("OpenAI returned an empty Teams response");
  }

  const sent = await sendReply(activity, text);

  /*
   * Save Assistant response locally, with the
   * Teams activity id used by read receipts.
   */
  await createMessage({
    threadId: thread.id,

    userId: user.id,

    organizationId: org.id,

    assistantId: assistant.id,

    channel,

    messageId: sent?.id ?? null,

    externalContactId: null,

    content: text,

    role: "assistant",

    deliveryStatus: sent?.ok ? "accepted" : "failed",

    failedAt: sent?.ok ? null : new Date().toISOString(),
  });
}

async function handleTeamsQuestionReply({
  activity,
  user,
  org,
  assistant,
  thread,
  conversationId,
}) {
  const reply = extractTeamsReply(activity);

  /*
   * A card tap should carry the card's id in
   * replyToId; if not, use the latest question
   * sent to this user on Teams.
   */
  if (reply.isTap && !reply.replyToMessageId) {
    const [latest] = await getRecentQuestionMessagesForUser(
      user.id,
      1,
      "teams",
    );

    reply.replyToMessageId = latest?.message_id ?? null;
  }

  return handleQuestionReply({
    user,

    reply,

    channel: "teams",

    inboundMsgId: activity?.id ?? null,

    contactId: activity?.from?.id ?? null,

    organization: org,

    sendText: async (text) => {
      const sent = await sendReply(activity, text);

      return { ...sent, providerMessageId: sent?.id ?? null };
    },

    resolveThread: async () => ({
      threadId: thread.id,

      assistantId: assistant.id,

      assistant,

      conversationId,
    }),
  });
}

/*
 * Read receipts only exist in personal chats, and only
 * reach the bot when the user has them turned on.
 */
async function handleReadReceipt(activity) {
  if (GetConversationType(activity) !== "personal") return;

  const org = await getOrganizationByTeamsTenantId(GetTenantId(activity));

  if (!org) return;

  const user = await getTeamsUserForOrganization({
    aadObjectId: GetAadObjectId(activity),

    organizationId: org.id,
  });

  if (!user) return;

  const readMessages = await markTeamsMessagesReadUpTo({
    userId: user.id,

    lastReadMessageId: activity?.value?.lastReadMessageId ?? null,
  });

  /*
   * A chain step that was just read sends the next
   * step, same as a WhatsApp read status.
   */
  for (const message of readMessages) {
    if (!message.message_chain_id) continue;

    try {
      await processReadChainAfterRead(message);
    } catch (error) {
      console.error("[TEAMS] Read chain step failed", {
        messageId: message.id,

        error: error?.message || String(error),
      });
    }
  }
}

/* =========================================================
   TEAMS ACTIVITY HELPERS
   ========================================================= */

function GetTenantId(activity) {
  return (
    activity?.channelData?.tenant?.id ||
    activity?.conversation?.tenantId ||
    null
  );
}

function GetFromId(activity) {
  return activity?.from?.id || null;
}

function GetAadObjectId(activity) {
  return activity?.from?.aadObjectId || null;
}

function GetConversationType(activity) {
  return activity?.conversation?.conversationType || "personal";
}

/* Nome do chat de grupo, ou "Equipa · Canal" num canal (#164). */
function GetGroupName(activity) {
  const team = activity?.channelData?.team?.name || null;
  const channel = activity?.channelData?.channel?.name || null;

  if (team) return channel && channel !== team ? `${team} · ${channel}` : team;

  return activity?.conversation?.name || null;
}

/* =========================================================
   PERSONAL INSTALLATION
   ========================================================= */

async function handleUserInstallation(activity) {
  const aadObjectId = GetAadObjectId(activity);

  const tenantId = GetTenantId(activity);

  const teamsUserId = GetFromId(activity);

  const conversationId = activity?.conversation?.id ?? null;

  const serviceUrl = activity?.serviceUrl ?? null;

  const conversationType = GetConversationType(activity);

  if (
    !aadObjectId ||
    !teamsUserId ||
    !conversationId ||
    !serviceUrl ||
    !tenantId
  ) {
    console.warn("[TEAMS install] Missing required fields", {
      aadObjectId,
      teamsUserId,
      conversationId,
      serviceUrl,
      tenantId,
    });

    await sendReply(
      activity,
      "Something went wrong, please contact the developers of MyDigitalBot.",
    );

    return;
  }

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    await sendReply(
      activity,
      "Este Tenant da Microsoft Teams não está registado em MyDigitalBot. Por favor contacta o teu administrador para registar esta Organização em MyDigitalBot.com.<br>Para mais ajuda escreve --help.",
    );

    return;
  }

  const user =
    (await getTeamsUserForOrganization({
      aadObjectId,

      organizationId: org.id,
    })) || (await resolveUnknownTeamsUser(activity, org));

  if (!user) {
    await sendReply(activity, NOT_REGISTERED_TEXT);

    return;
  }

  const assistant = await getAssistantById(user.assistant_id);

  await assertAssistantMatchesOrganization(assistant, org.id);

  const installation = await upsertPersonalInstallation({
    organization_id: org.id,

    assistant_id: assistant.id,

    scope: "user",

    user_id: user.id,

    tenant_id: tenantId,

    service_url: serviceUrl,

    conversation_id: conversationId,

    conversation_type: conversationType,

    teams_user_id: teamsUserId,

    last_seen_at: new Date().toISOString(),
  });

  try {
    if (user.teams_from_id !== teamsUserId) {
      await updateUser(user.id, {
        teamsFromId: teamsUserId,
      });
    }
  } catch (error) {
    console.error("[TEAMS] Failed to sync teamsFromId", {
      userId: user.id,

      teamsUserId,

      installationId: installation?.id,

      error,
    });
  }

  await sendReply(activity, "Conversation successfully connected.");
}

/* =========================================================
   GROUP / CHANNEL INSTALLATION
   ========================================================= */

async function handleGroupInstallation(activity) {
  const tenantId = GetTenantId(activity);

  const serviceUrl = activity?.serviceUrl ?? null;

  const conversationId = activity?.conversation?.id ?? null;

  const conversationType = GetConversationType(activity);

  const teamAadGroupId = activity?.channelData?.team?.aadGroupId ?? null;

  const teamId = activity?.channelData?.team?.id ?? null;

  const channelId = activity?.channelData?.channel?.id ?? null;

  if (!tenantId || !serviceUrl || !conversationId) {
    console.warn("[TEAMS group install] Missing fields:", {
      tenantId,
      serviceUrl,
      conversationId,
      conversationType,
    });

    return;
  }

  const org = await getOrganizationByTeamsTenantId(tenantId);

  if (!org) {
    await sendReply(
      activity,
      "This tenant isn't registered in MyDigitalBot.com yet. Ask your admin to register it.",
    );

    return;
  }

  /*
   * Ao reinstalar, o grupo mantém o assistente e o nome que o administrador
   * escolheu na página de grupos (#165).
   */
  const existing = await getTeamsInstallationByConversation({
    tenantId,

    conversationId,
  });

  const keepExisting =
    existing && Number(existing.organization_id) === Number(org.id);

  const defaultAssistant =
    keepExisting && existing.assistant_id
      ? await getAssistantById(existing.assistant_id)
      : await getFirstAssistantInOrg(org.id);

  if (!defaultAssistant) {
    throw new Error("Organization does not have an assistant");
  }

  await assertAssistantMatchesOrganization(defaultAssistant, org.id);

  const groupName =
    (keepExisting && existing.name) ||
    GetGroupName(activity) ||
    (await getTeamName({ serviceUrl, teamId }));

  await upsertTeamsInstallation({
    organization_id: org.id,

    assistant_id: defaultAssistant.id,

    name: groupName || null,

    is_active: true,

    scope: "group",

    user_id: null,

    tenant_id: tenantId,

    service_url: serviceUrl,

    conversation_id: conversationId,

    conversation_type: conversationType,

    teams_user_id: null,

    team_aad_group_id: teamAadGroupId,

    team_id: teamId,

    channel_id: channelId,

    last_seen_at: new Date().toISOString(),
  });

  const channel = "teams";

  let thread = await getGroupThreadForConversation({
    assistantId: defaultAssistant.id,

    channel,

    externalConversationId: conversationId,
  });

  if (thread && Number(thread.assistant_id) !== Number(defaultAssistant.id)) {
    const error = new Error(
      "Group thread does not belong to the selected assistant",
    );

    error.status = 403;

    throw error;
  }

  if (thread && thread.scope && thread.scope !== "group") {
    const error = new Error(
      "Teams group conversation resolved to a non-group thread",
    );

    error.status = 409;

    throw error;
  }

  /*
   * Create or migrate the OpenAI Conversation.
   */
  const ensured = await ensureTeamsConversation({
    thread,

    userId: null,

    assistant: defaultAssistant,

    organizationId: org.id,

    channel,

    scope: "group",

    externalConversationId: conversationId,
  });

  thread = ensured.thread;

  if (Number(thread.assistant_id) !== Number(defaultAssistant.id)) {
    const error = new Error(
      "Group thread does not belong to the selected assistant",
    );

    error.status = 403;

    throw error;
  }

  if (thread.scope && thread.scope !== "group") {
    const error = new Error(
      "Teams group conversation resolved to a non-group thread",
    );

    error.status = 409;

    throw error;
  }

  console.log("[TEAMS group install] Conversation ready", {
    dbThreadId: thread.id,

    openAiConversationId: ensured.conversationId,

    teamsConversationId: conversationId,
  });

  await sendReply(
    activity,

    conversationType === "channel"
      ? "Fui adicionado a este canal. Menciona-me (@MyDigitalBot) para falares comigo."
      : "Fui adicionado a este chat. Menciona-me (@MyDigitalBot) para falares comigo.",
  );
}

/* =========================================================
   ROUTES
   ========================================================= */

export async function POST(req) {
  try {
    let activity;

    try {
      activity = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
        },
        {
          status: 400,
        },
      );
    }

    if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
      return NextResponse.json(
        {
          error: "Invalid Teams activity",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Validate that this really came from
     * Microsoft Teams before processing it.
     */
    const teamsAuth = await requireValidTeamsRequest(req, activity);

    if (teamsAuth.error) {
      return teamsAuth.error;
    }

    /*
     * Num grupo ou canal o texto traz a menção ao bot, que tem de sair antes
     * dos comandos e do assistente (#164).
     */
    if (
      activity.type === "message" &&
      typeof activity.text === "string" &&
      GetConversationType(activity) !== "personal"
    ) {
      activity.text = stripBotMention(activity);
    }

    if (
      activity.type === "message" &&
      typeof activity.text === "string" &&
      activity.text.trim()
    ) {
      await handleUserInteraction(activity);
    }

    if (
      activity.type === "event" &&
      activity.name === "application/vnd.microsoft.readReceipt"
    ) {
      await handleReadReceipt(activity);
    }

    if (activity.type === "installationUpdate" && activity.action === "add") {
      const conversationType = GetConversationType(activity);

      if (
        conversationType === "channel" ||
        conversationType === "groupChat" ||
        activity?.conversation?.isGroup === true
      ) {
        await handleGroupInstallation(activity);
      } else {
        await handleUserInstallation(activity);
      }
    }

    if (
      activity.type === "installationUpdate" &&
      activity.action === "remove"
    ) {
      console.log("[TEAMS] Installation removed", {
        conversationId: activity?.conversation?.id ?? null,

        tenantId: GetTenantId(activity),
      });

      const tenantId = GetTenantId(activity);

      const conversationId = activity?.conversation?.id ?? null;

      if (tenantId && conversationId) {
        await deactivateGroupInstallation({ tenantId, conversationId });
      }
    }

    return NextResponse.json(
      {
        ok: true,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    return handleApiError(error, "Failed to process Teams message");
  }
}

export async function GET() {
  return NextResponse.json({
    status: 200,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,

    headers: {
      Allow: "GET, POST, OPTIONS",
    },
  });
}
