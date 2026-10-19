// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
import { getSupabaseAdminClient } from "@/lib/db/admin";

const sb = getSupabaseAdminClient();

function nowIso() {
  return new Date().toISOString();
}

export async function createMessageChain({
  organizationId,
  createdByUserId = null,
  channel = "whatsapp",
  status = "active",
  scheduledFor = null,
  timezone = null,
  recipientCount = 0,
}) {
  if (!organizationId) {
    throw new Error("organizationId is required");
  }

  const { data, error } = await sb
    .from("message_chain")
    .insert({
      organization_id: organizationId,
      created_by_user_id: createdByUserId,
      channel,
      status,
      scheduled_for: scheduledFor,
      timezone,
      recipient_count: recipientCount,
      started_at: status === "active" ? nowIso() : null,
      processing_started_at: status === "processing" ? nowIso() : null,
      updated_at: nowIso(),
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function createMessageChainSteps({ chainId, steps }) {
  if (!chainId) {
    throw new Error("chainId is required");
  }

  if (!Array.isArray(steps) || steps.length < 2 || steps.length > 10) {
    throw new Error("A read chain must have between 2 and 10 steps.");
  }

  const rows = steps.map((step, index) => ({
    chain_id: chainId,
    step_index: index + 1,
    payload: step,
  }));

  const { data, error } = await sb
    .from("message_chain_step")
    .insert(rows)
    .select("*")
    .order("step_index", { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function createMessageChainRecipients({ chainId, recipients }) {
  if (!chainId) {
    throw new Error("chainId is required.");
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new Error("At least one recipient is required.");
  }

  const rows = recipients.map((recipient) => ({
    chain_id: chainId,
    user_id: recipient.userId,
    status: "active",
    current_step_index: 0,
  }));

  const { data, error } = await sb
    .from("message_chain_recipient")
    .insert(rows)
    .select("*");

  if (error) throw error;

  return data || [];
}

export async function getMessageChainById(chainId) {
  const { data, error } = await sb
    .from("message_chain")
    .select("*")
    .eq("id", chainId)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getMessageChainStep({ chainId, stepIndex }) {
  const { data, error } = await sb
    .from("message_chain_step")
    .select("*")
    .eq("chain_id", chainId)
    .eq("step_index", stepIndex)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getMessageChainRecipientById(id) {
  const { data, error } = await sb
    .from("message_chain_recipient")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getMessageChainRecipient({ chainId, userId }) {
  const { data, error } = await sb
    .from("message_chain_recipient")
    .select("*")
    .eq("chain_id", chainId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getValidatedMessageChainContext({
  chainId,
  chainStepId,
  chainRecipientId,
  stepIndex,
  userId,
  organizationId,
}) {
  if (
    !chainId ||
    !chainStepId ||
    !chainRecipientId ||
    !stepIndex ||
    !userId ||
    !organizationId
  ) {
    return null;
  }

  const chain = await getMessageChainById(chainId);
  if (!chain || Number(chain.organization_id) !== Number(organizationId)) {
    return null;
  }

  const { data: step, error: stepError } = await sb
    .from("message_chain_step")
    .select("*")
    .eq("id", chainStepId)
    .eq("chain_id", chainId)
    .eq("step_index", Number(stepIndex))
    .maybeSingle();

  if (stepError) throw stepError;
  if (!step) return null;

  const { data: recipient, error: recipientError } = await sb
    .from("message_chain_recipient")
    .select("*")
    .eq("id", chainRecipientId)
    .eq("chain_id", chainId)
    .eq("user_id", userId)
    .maybeSingle();

  if (recipientError) throw recipientError;
  if (!recipient) return null;

  return { chain, step, recipient };
}

export async function getMessageChainRecipientsByChainId(chainId) {
  if (!chainId) {
    throw new Error("chainId is required.");
  }

  const { data, error } = await sb
    .from("message_chain_recipient")
    .select("*")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function claimDueScheduledMessageChains({ limit = 25 } = {}) {
  const { data: dueChains, error: selectError } = await sb
    .from("message_chain")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso())
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (selectError) throw selectError;

  if (!Array.isArray(dueChains) || dueChains.length === 0) {
    return [];
  }

  const claimed = [];

  for (const chain of dueChains) {
    const { data, error } = await sb
      .from("message_chain")
      .update({
        status: "processing",
        processing_started_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", chain.id)
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      claimed.push(data);
    }
  }

  return claimed;
}

export async function markMessageChainActive(chainId) {
  const { data, error } = await sb
    .from("message_chain")
    .update({
      status: "active",
      started_at: nowIso(),
      error_message: null,
      updated_at: nowIso(),
    })
    .eq("id", chainId)
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

export async function markMessageChainFailed({ chainId, errorMessage }) {
  const { data, error } = await sb
    .from("message_chain")
    .update({
      status: "failed",
      error_message: errorMessage || "Read chain failed.",
      updated_at: nowIso(),
    })
    .eq("id", chainId)
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

export async function createMessageChainDelivery({
  chainId,
  chainStepId,
  chainRecipientId,
  userId,
  messageDbId = null,
  providerMessageId = null,
  stepIndex,
  status = "sent",
  sentAt = new Date(),
  readAt = null,
  failedAt = null,
  dueAt = null,
  errorMessage = null,
}) {
  if (!chainId || !chainStepId || !chainRecipientId || !userId || !stepIndex) {
    throw new Error("Complete message chain delivery context is required");
  }

  const { data, error } = await sb
    .from("message_chain_delivery")
    .upsert(
      {
        chain_id: chainId,
        chain_step_id: chainStepId,
        chain_recipient_id: chainRecipientId,
        user_id: userId,
        message_id: messageDbId,
        provider_message_id: providerMessageId,
        step_index: stepIndex,
        status,
        sent_at: sentAt ? new Date(sentAt).toISOString() : null,
        read_at: readAt ? new Date(readAt).toISOString() : null,
        failed_at: failedAt ? new Date(failedAt).toISOString() : null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        error: errorMessage,
        updated_at: nowIso(),
      },
      {
        onConflict: "chain_recipient_id,step_index",
      },
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getMessageChainDelivery({ chainRecipientId, stepIndex }) {
  const { data, error } = await sb
    .from("message_chain_delivery")
    .select("*")
    .eq("chain_recipient_id", chainRecipientId)
    .eq("step_index", stepIndex)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function claimDueScheduledMessageChainDeliveries({ limit = 50 }) {
  const { data: dueDeliveries, error: selectError } = await sb
    .from("message_chain_delivery")
    .select("*")
    .eq("status", "scheduled")
    .lte("due_at", nowIso())
    .order("due_at", { ascending: true })
    .limit(limit);

  if (selectError) throw selectError;

  if (!Array.isArray(dueDeliveries) || dueDeliveries.length === 0) {
    return [];
  }

  const claimed = [];

  for (const delivery of dueDeliveries) {
    const { data, error } = await sb
      .from("message_chain_delivery")
      .update({
        status: "processing",
        updated_at: nowIso(),
      })
      .eq("id", delivery.id)
      .eq("status", "scheduled")
      .select("*")
      .maybeSingle();

    if (error) throw error;

    if (data) {
      claimed.push(data);
    }
  }

  return claimed;
}

export async function markMessageChainDeliveryRead({
  chainId,
  chainRecipientId,
  stepIndex,
  readAt = new Date(),
}) {
  const iso = new Date(readAt).toISOString();

  const { data, error } = await sb
    .from("message_chain_delivery")
    .update({
      status: "read",
      read_at: iso,
      updated_at: nowIso(),
    })
    .eq("chain_id", chainId)
    .eq("chain_recipient_id", chainRecipientId)
    .eq("step_index", stepIndex)
    .select()
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function markMessageChainDeliveryFailed({
  chainRecipientId,
  stepIndex,
  errorMessage,
}) {
  const { data, error } = await sb
    .from("message_chain_delivery")
    .update({
      status: "failed",
      failed_at: nowIso(),
      error: errorMessage,
      updated_at: nowIso(),
    })
    .eq("chain_recipient_id", chainRecipientId)
    .eq("step_index", stepIndex)
    .select()
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function updateMessageChainRecipientProgress({
  chainId,
  chainRecipientId,
  userId,
  currentStepIndex,
  status = null,
}) {
  const patch = {
    current_step_index: currentStepIndex,
    updated_at: nowIso(),
  };

  if (status) {
    patch.status = status;
  }

  const { data, error } = await sb
    .from("message_chain_recipient")
    .update(patch)
    .eq("id", chainRecipientId)
    .eq("chain_id", chainId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function completeMessageChainRecipient({
  chainId,
  chainRecipientId,
  userId,
  reason = null,
}) {
  const { data, error } = await sb
    .from("message_chain_recipient")
    .update({
      status: "completed",
      completed_at: nowIso(),
      stopped_reason: reason,
      updated_at: nowIso(),
    })
    .eq("id", chainRecipientId)
    .eq("chain_id", chainId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function stopMessageChainRecipient({ chainRecipientId, reason }) {
  const { data, error } = await sb
    .from("message_chain_recipient")
    .update({
      status: "stopped",
      stopped_reason: reason || "Stopped",
      updated_at: nowIso(),
    })
    .eq("id", chainRecipientId)
    .select()
    .single();

  if (error) throw error;

  return data;
}
