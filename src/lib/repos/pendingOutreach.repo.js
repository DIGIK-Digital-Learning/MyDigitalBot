// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
// /lib/repos/pendingOutreach.repo.js
require("dotenv").config();
import { getSupabaseAdminClient } from "@/lib/db/admin";

const supabase = getSupabaseAdminClient();

export async function createPendingOutreach({
  orgId,
  userId,
  payload,
  expiresAt, // Date or ISO string
  templateMessageId = null,
  messageChainId = null,
  messageChainStepId = null,
  messageChainRecipientId = null,
  messageChainStepIndex = null,
}) {
  const expiresISO =
    expiresAt instanceof Date
      ? expiresAt.toISOString()
      : new Date(expiresAt).toISOString();
  const { data, error } = await supabase
    .from("pending_outreach")
    .insert([
      {
        org_id: orgId,
        user_id: userId,
        payload, // jsonb
        status: "pending",
        expires_at: expiresISO, // <- toISOString() (was toIsoString)
        template_message_id: templateMessageId,
        message_chain_id: messageChainId,
        message_chain_step_id: messageChainStepId,
        message_chain_recipient_id: messageChainRecipientId,
        message_chain_step_index: messageChainStepIndex,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAllPendingOutreachByUser(userId) {
  const { data, error } = await supabase
    .from("pending_outreach")
    .select(
      `
        id,
        org_id,
        user_id,
        payload,
        status,
        expires_at,
        template_message_id,
        message_chain_id,
        message_chain_step_id,
        message_chain_recipient_id,
        message_chain_step_index,
        created_at
      `,
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .is("reply_message_id", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function claimPendingOutreach(id, replyMessageId) {
  const { data, error } = await supabase
    .from("pending_outreach")
    .update({ reply_message_id: replyMessageId })
    .eq("id", id)
    .eq("status", "pending")
    .is("reply_message_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function releasePendingOutreach(id) {
  const { error } = await supabase
    .from("pending_outreach")
    .update({ reply_message_id: null })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw error;
}

export async function markPendingOutreachReplied(id, replyMessageId) {
  const { data, error } = await supabase
    .from("pending_outreach") // <- was missing
    .update({
      status: "replied",
      reply_message_id: replyMessageId ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
