import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// /lib/repos/threads.repo.js

const SELECT_COLS = `
  id,
  user_id,
  assistant_id,
  ai_thread_id,
  openai_conversation_id,
  channel,
  scope,
  external_conversation_id,
  created_at,
  last_message_at,
  is_active
`;

function nowIso() {
  return new Date().toISOString();
}

function parsePositiveInt(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${fieldName} must be a positive integer. Received: ${value}`,
    );
  }

  return parsed;
}

/**
 * Create a new DB thread.
 *
 * During the migration this supports BOTH:
 *
 * OLD:
 *   aiThreadId = "thread_..."
 *
 * NEW:
 *   openAiConversationId = "conv_..."
 *
 * Once Assistants API support is completely removed,
 * aiThreadId can disappear.
 */
export async function createThread({
  userId = null,
  assistantId,
  aiThreadId = null,
  openAiConversationId = null,
  channel,
  scope,
  externalConversationId = null,
}) {
  const supabase = getSupabaseAdminClient();
  const parsedAssistantId = parsePositiveInt(assistantId, "assistantId");

  let parsedUserId = null;

  if (userId !== null && userId !== undefined) {
    parsedUserId = parsePositiveInt(userId, "userId");
  }

  if (!channel) {
    throw new Error("createThread requires channel");
  }

  if (!scope) {
    throw new Error("createThread requires scope");
  }

  /*
   * During migration, a thread must have either:
   *
   * - legacy OpenAI Thread ID
   * - new OpenAI Conversation ID
   *
   * New code should use openAiConversationId.
   */
  if (!aiThreadId && !openAiConversationId) {
    throw new Error(
      "createThread requires either aiThreadId or openAiConversationId",
    );
  }

  const payload = {
    user_id: parsedUserId,
    assistant_id: parsedAssistantId,

    // Legacy Assistants API identifier.
    ai_thread_id: aiThreadId || null,

    // New Responses / Conversations identifier.
    openai_conversation_id: openAiConversationId || null,

    channel,
    scope,

    /*
     * This is NOT an OpenAI ID.
     *
     * It is the external platform conversation,
     * for example a Teams conversation.
     */
    external_conversation_id: externalConversationId || null,

    last_message_at: nowIso(),
  };

  const { data, error } = await supabase
    .from("thread")
    .insert([payload])
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update last_message_at whenever a message
 * is received or sent.
 */
export async function touchThread(threadId) {
  const supabase = getSupabaseAdminClient();
  const parsedThreadId = parsePositiveInt(threadId, "threadId");

  const { data, error } = await supabase
    .from("thread")
    .update({
      last_message_at: nowIso(),
    })
    .eq("id", parsedThreadId)
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Attach a NEW OpenAI Conversation to an
 * existing DB thread.
 *
 * This is especially important for migrating
 * old WhatsApp / Teams threads.
 *
 * Example:
 *
 * BEFORE
 * ai_thread_id = "thread_old123"
 * openai_conversation_id = null
 *
 * AFTER
 * ai_thread_id = "thread_old123"
 * openai_conversation_id = "conv_new123"
 *
 * We leave the old ID untouched during migration.
 */
export async function setThreadConversationId(threadId, openAiConversationId) {
  const supabase = getSupabaseAdminClient();
  const parsedThreadId = parsePositiveInt(threadId, "threadId");

  if (
    typeof openAiConversationId !== "string" ||
    !openAiConversationId.trim()
  ) {
    throw new Error("setThreadConversationId requires openAiConversationId");
  }

  const conversationId = openAiConversationId.trim();

  const { data, error } = await supabase
    .from("thread")
    .update({
      openai_conversation_id: conversationId,
      last_message_at: nowIso(),
    })
    .eq("id", parsedThreadId)
    .select(SELECT_COLS)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Personal thread for a user on a given channel.
 *
 * Used for things like:
 *
 * WhatsApp user
 * Teams personal chat
 */
export async function getUserThreadForChannel({
  userId,
  assistantId,
  channel,
}) {
  const supabase = getRepositoryReadClient();
  const parsedUserId = parsePositiveInt(userId, "userId");

  const parsedAssistantId = parsePositiveInt(assistantId, "assistantId");

  if (!channel) {
    throw new Error("getUserThreadForChannel requires channel");
  }

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("user_id", parsedUserId)
    .eq("assistant_id", parsedAssistantId)
    .eq("channel", channel)
    .eq("scope", "user")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Group/channel thread identified by an
 * external conversation ID.
 *
 * Primarily used by Teams group chats/channels.
 */
export async function getGroupThreadForConversation({
  assistantId,
  channel,
  externalConversationId,
}) {
  const supabase = getRepositoryReadClient();
  const parsedAssistantId = parsePositiveInt(assistantId, "assistantId");

  if (!channel) {
    throw new Error("getGroupThreadForConversation requires channel");
  }

  if (!externalConversationId) {
    throw new Error(
      "getGroupThreadForConversation requires externalConversationId",
    );
  }

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("assistant_id", parsedAssistantId)
    .eq("channel", channel)
    .eq("scope", "group")
    .eq("external_conversation_id", externalConversationId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Get all DB threads belonging to a user.
 */
export async function getThreadsForUser(userId) {
  const supabase = getRepositoryReadClient();
  const parsedUserId = parsePositiveInt(userId, "userId");

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("user_id", parsedUserId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get DB thread by our own integer ID.
 */
export async function getThreadById(threadId) {
  const supabase = getRepositoryReadClient();
  const parsedThreadId = parsePositiveInt(threadId, "threadId");

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("id", parsedThreadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * NEW:
 *
 * Find a DB thread from an OpenAI Conversation ID.
 *
 * Example:
 *
 * conv_abc123
 */
export async function getThreadByConversationId(openAiConversationId) {
  const supabase = getRepositoryReadClient();
  if (
    typeof openAiConversationId !== "string" ||
    !openAiConversationId.trim()
  ) {
    return null;
  }

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("openai_conversation_id", openAiConversationId.trim())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * LEGACY:
 *
 * Find a DB thread from an old Assistants API
 * thread ID.
 *
 * Example:
 *
 * thread_abc123
 *
 * Keep this until WhatsApp and Teams have both
 * been migrated.
 */
export async function getThreadByAiId(aiThreadId) {
  const supabase = getRepositoryReadClient();
  if (typeof aiThreadId !== "string" || !aiThreadId.trim()) {
    return null;
  }

  const { data, error } = await supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("ai_thread_id", aiThreadId.trim())
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

/**
 * Transitional helper.
 *
 * Supports both old and new OpenAI identifiers.
 *
 * NEW callers should provide:
 *
 *   openAiConversationId
 *
 * Legacy callers may still provide:
 *
 *   aiThreadId
 */
export async function getOrCreateThread({
  userId = null,
  assistantId,
  aiThreadId = null,
  openAiConversationId = null,
  channel = "whatsapp",
  scope = "user",
  externalConversationId = null,
}) {
  /*
   * Prefer the new Conversation ID whenever
   * it exists.
   */
  if (openAiConversationId) {
    const existing = await getThreadByConversationId(openAiConversationId);

    if (existing) {
      return existing;
    }
  }

  /*
   * Fall back to legacy Assistants API Thread.
   */
  if (aiThreadId) {
    const existing = await getThreadByAiId(aiThreadId);

    if (existing) {
      return existing;
    }
  }

  if (!aiThreadId && !openAiConversationId) {
    throw new Error(
      "getOrCreateThread requires either aiThreadId or openAiConversationId",
    );
  }

  return createThread({
    userId,
    assistantId,
    aiThreadId,
    openAiConversationId,
    channel,
    scope,
    externalConversationId,
  });
}

/**
 * Thread de um utilizador num canal com o seu assistente ativo (ou a mais
 * recente, se não tiver nenhum ativo). Serve para ligar à conversa mensagens
 * enviadas fora do webhook (perguntas, mensagens em espera).
 */
export async function getLatestUserThreadForChannel(userId, channel) {
  const supabase = getRepositoryReadClient();
  const parsedUserId = Number(userId);

  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0 || !channel) {
    return null;
  }

  // Com vários assistentes, a conversa é a do assistente ativo (#133); sem
  // conversa com ele devolve null, para não cair na de outro assistente.
  const { data: owner, error: ownerError } = await supabase
    .from("user")
    .select("assistant_id")
    .eq("id", parsedUserId)
    .maybeSingle();

  if (ownerError) throw ownerError;

  let query = supabase
    .from("thread")
    .select(SELECT_COLS)
    .eq("user_id", parsedUserId)
    .eq("channel", channel)
    .eq("scope", "user");

  if (owner?.assistant_id != null) {
    query = query.eq("assistant_id", owner.assistant_id);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}
