import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
const OUTBOUND_ROLES = ["assistant", "system"];

function toIsoDate(value = new Date()) {
  return new Date(value).toISOString();
}

const MESSAGE_SELECT = `
  id,
  thread_id,
  user_id,
  organization_id,
  assistant_id,
  channel,
  message_id,
  contact_id,
  content,
  role,
  delivery_status,
  delivered_at,
  read_at,
  failed_at,
  scheduled_broadcast_id,
  automation_run_id,
  message_chain_id,
  message_chain_step_id,
  message_chain_recipient_id,
  message_chain_step_index,
  question_id,
  created_at
`;

export async function createMessage({
  threadId,
  userId,
  organizationId = null,
  assistantId = null,
  channel = null,
  messageId = null,
  externalContactId = null,
  content = "",
  role = "user",
  deliveryStatus = null,
  deliveredAt = null,
  readAt = null,
  failedAt = null,
  scheduledBroadcastId = null,
  automationRunId = null,

  messageChainId = null,
  messageChainStepId = null,
  messageChainRecipientId = null,
  messageChainStepIndex = null,

  questionId = null,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("message")
    .insert([
      {
        thread_id: threadId ?? null,
        user_id: userId ?? null,
        organization_id: organizationId,
        assistant_id: assistantId,
        channel,
        message_id: messageId,
        contact_id: externalContactId,
        content,
        role,
        delivery_status: deliveryStatus,
        delivered_at: deliveredAt,
        read_at: readAt,
        failed_at: failedAt,
        scheduled_broadcast_id: scheduledBroadcastId,
        automation_run_id: automationRunId,

        message_chain_id: messageChainId,
        message_chain_step_id: messageChainStepId,
        message_chain_recipient_id: messageChainRecipientId,
        message_chain_step_index: messageChainStepIndex,

        question_id: questionId,
      },
    ])
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function getMessagesInThread(threadId) {
  const supabase = getRepositoryReadClient();
  const { data, error } = await supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getMessageById(id) {
  const supabase = getRepositoryReadClient();
  const { data, error } = await supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getMessageByProviderId(
  messageId,
  organizationId,
) {
  const supabase = getRepositoryReadClient();
  if (!messageId || !organizationId) {
    return null;
  }

  const { data, error } = await supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("message_id", messageId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getLastInboundForUser(userId) {
  const supabase = getRepositoryReadClient();
  const { data, error } = await supabase
    .from("message")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getLastInboundForUserAssistant(
  userId,
  assistantId,
  channel = null,
) {
  const supabase = getRepositoryReadClient();
  let query = supabase
    .from("message")
    .select("id, created_at, assistant_id, channel")
    .eq("user_id", userId)
    .eq("role", "user")
    .eq("assistant_id", assistantId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function markMessageDelivered(messageRowId, at = new Date()) {
  const supabase = getSupabaseAdminClient();
  const iso = toIsoDate(at);

  const current = await getMessageById(messageRowId);

  if (!current) return null;

  const patch = {
    delivered_at: current.delivered_at || iso,
  };

  if (!current.read_at) {
    patch.delivery_status = "delivered";
  }

  const { data, error } = await supabase
    .from("message")
    .update(patch)
    .eq("id", messageRowId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function markMessageRead(messageRowId, at = new Date()) {
  const supabase = getSupabaseAdminClient();
  const iso = toIsoDate(at);

  const current = await getMessageById(messageRowId);

  if (!current) return null;

  if (current.read_at) {
    return current;
  }

  const patch = {
    delivery_status: "read",
    read_at: iso,
  };

  if (!current.delivered_at) {
    patch.delivered_at = iso;
  }

  const { data, error } = await supabase
    .from("message")
    .update(patch)
    .eq("id", messageRowId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function markMessageFailed(messageRowId, at = new Date()) {
  const supabase = getSupabaseAdminClient();
  const iso = toIsoDate(at);

  const current = await getMessageById(messageRowId);

  if (!current) return null;

  if (current.read_at || current.delivered_at) {
    return current;
  }

  const { data, error } = await supabase
    .from("message")
    .update({
      delivery_status: "failed",
      failed_at: iso,
    })
    .eq("id", messageRowId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function markMessageDeliveredByProviderId(
  providerMessageId,
  at = new Date(),
) {
  const message = await getMessageByProviderId(providerMessageId);
  if (!message) return null;

  return markMessageDelivered(message.id, at);
}

export async function markMessageReadByProviderId(
  providerMessageId,
  at = new Date(),
  organizationId,
) {
  const message = await getMessageByProviderId(
    providerMessageId,
    organizationId,
  );

  if (!message) {
    return null;
  }

  return markMessageRead(message.id, at);
}

export async function markMessageFailedByProviderId(
  providerMessageId,
  at = new Date(),
) {
  const message = await getMessageByProviderId(providerMessageId);
  if (!message) return null;

  return markMessageFailed(message.id, at);
}

export async function getPendingWhatsappMessagesForReadReceiptSync({
  organizationId = null,
  threadId = null,
  scheduledBroadcastId = null,
  limit = 50,
  maxAgeHours = 168,
} = {}) {
  const supabase = getRepositoryReadClient();
  const safeLimit = Math.min(Number(limit || 50), 100);
  const since = new Date(
    Date.now() - Number(maxAgeHours || 168) * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("channel", "whatsapp")
    .in("role", OUTBOUND_ROLES)
    .not("message_id", "is", null)
    .is("read_at", null)
    .is("failed_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  if (threadId) {
    query = query.eq("thread_id", threadId);
  }

  if (scheduledBroadcastId) {
    query = query.eq("scheduled_broadcast_id", scheduledBroadcastId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/*
 * Teams read receipts only carry the id of the last message read,
 * so everything sent to the user up to that message counts as read.
 * When that id is not stored (e.g. command replies), use `at`.
 */
export async function markTeamsMessagesReadUpTo({
  userId,
  lastReadMessageId = null,
  at = new Date(),
}) {
  const supabase = getSupabaseAdminClient();
  const iso = toIsoDate(at);
  let cutoff = iso;

  if (lastReadMessageId) {
    const { data: lastRead, error: lookupError } = await supabase
      .from("message")
      .select("created_at")
      .eq("user_id", userId)
      .eq("channel", "teams")
      .eq("message_id", lastReadMessageId)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (lastRead?.created_at) cutoff = lastRead.created_at;
  }

  const { data, error } = await supabase
    .from("message")
    .update({ delivery_status: "read", delivered_at: iso, read_at: iso })
    .eq("user_id", userId)
    .eq("channel", "teams")
    .in("role", OUTBOUND_ROLES)
    .is("read_at", null)
    .lte("created_at", cutoff)
    .select(MESSAGE_SELECT);

  if (error) throw error;
  return data ?? [];
}

export async function getLastOutboundForUserAssistant(
  userId,
  assistantId,
  channel = null,
) {
  const supabase = getRepositoryReadClient();
  let query = supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .eq("assistant_id", assistantId)
    .in("role", OUTBOUND_ROLES)
    .order("created_at", { ascending: false })
    .limit(1);

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function getInboundAfterForUserAssistant(
  userId,
  assistantId,
  channel,
  afterDate,
) {
  const supabase = getRepositoryReadClient();
  let query = supabase
    .from("message")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("assistant_id", assistantId)
    .eq("role", "user")
    .gt("created_at", afterDate)
    .order("created_at", { ascending: false })
    .limit(1);

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function isWindowOpenForUser(userId) {
  const last = await getLastInboundForUser(userId);
  if (!last) return false;

  const diffMs = Date.now() - new Date(last.created_at).getTime();
  return diffMs < 24 * 60 * 60 * 1000;
}

/**
 * Últimas mensagens com pergunta entregues a um contacto, da mais recente
 * para a mais antiga. Serve para ligar uma resposta escrita à mão (sem
 * referência à mensagem) à pergunta mais recente.
 */
export async function getRecentQuestionMessagesForUser(
  userId,
  limit = 5,
  channel = null,
) {
  const supabase = getRepositoryReadClient();
  if (!userId) return [];

  let query = supabase
    .from("message")
    .select(MESSAGE_SELECT)
    .eq("user_id", userId)
    .not("question_id", "is", null)
    .in("role", OUTBOUND_ROLES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (channel) {
    query = query.eq("channel", channel);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}
