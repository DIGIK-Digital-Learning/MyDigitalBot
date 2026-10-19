require("dotenv").config();
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TABLE = "whatsapp_opening_gate";
const GATE_COLUMNS =
  "org_id,user_id,template_message_id,pending_outreach_id,reply_message_id,status,expires_at,accepted_at,created_at,updated_at";

export async function getWhatsappOpeningGate({ orgId, userId }) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(GATE_COLUMNS)
    .eq("org_id", String(orgId))
    .eq("user_id", String(userId))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const now = new Date().toISOString();
  if (
    ["sending", "pending"].includes(data.status) &&
    Date.parse(data.expires_at) <= Date.now()
  ) {
    const { data: expired, error: expireError } = await supabase
      .from(TABLE)
      .update({ status: "expired", updated_at: now })
      .eq("org_id", String(orgId))
      .eq("user_id", String(userId))
      .eq("status", data.status)
      .lte("expires_at", now)
      .select(GATE_COLUMNS)
      .maybeSingle();

    if (expireError) throw expireError;
    return expired || { ...data, status: "expired" };
  }

  return data;
}

export async function claimWhatsappOpeningGate({ orgId, userId, expiresAt }) {
  const key = { orgId: String(orgId), userId: String(userId) };
  const existing = await getWhatsappOpeningGate(key);
  const now = new Date().toISOString();
  const expiresISO =
    expiresAt instanceof Date
      ? expiresAt.toISOString()
      : new Date(expiresAt).toISOString();
  const values = {
    template_message_id: null,
    pending_outreach_id: null,
    reply_message_id: null,
    status: "sending",
    expires_at: expiresISO,
    accepted_at: null,
    updated_at: now,
  };

  if (!existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        org_id: key.orgId,
        user_id: key.userId,
        ...values,
      })
      .select(GATE_COLUMNS)
      .single();

    if (!error) return { claimed: true, gate: data };
    if (error.code !== "23505") throw error;

    return {
      claimed: false,
      gate: await getWhatsappOpeningGate(key),
    };
  }

  if (["sending", "pending"].includes(existing.status)) {
    return { claimed: false, gate: existing };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(values)
    .eq("org_id", key.orgId)
    .eq("user_id", key.userId)
    .eq("status", existing.status)
    .select(GATE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (data) return { claimed: true, gate: data };

  return {
    claimed: false,
    gate: await getWhatsappOpeningGate(key),
  };
}

export async function markWhatsappOpeningGateSent({
  orgId,
  userId,
  templateMessageId,
  pendingOutreachId,
}) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "pending",
      template_message_id: templateMessageId || null,
      pending_outreach_id: pendingOutreachId ? String(pendingOutreachId) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", String(orgId))
    .eq("user_id", String(userId))
    .eq("status", "sending")
    .select(GATE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function attachWhatsappOpeningGateOutreach({
  orgId,
  userId,
  pendingOutreachId,
}) {
  const { error } = await supabase
    .from(TABLE)
    .update({
      pending_outreach_id: pendingOutreachId ? String(pendingOutreachId) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", String(orgId))
    .eq("user_id", String(userId))
    .eq("status", "sending");

  if (error) throw error;
}

export async function failWhatsappOpeningGate({ orgId, userId }) {
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("org_id", String(orgId))
    .eq("user_id", String(userId))
    .eq("status", "sending");

  if (error) throw error;
}

export async function acceptWhatsappOpeningGate({
  orgId,
  userId,
  templateMessageId,
  replyMessageId,
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: "accepted",
      reply_message_id: replyMessageId || null,
      accepted_at: now,
      updated_at: now,
    })
    .eq("org_id", String(orgId))
    .eq("user_id", String(userId))
    .in("status", ["sending", "pending"])
    .gt("expires_at", now)
    .or(
      `template_message_id.eq.${String(templateMessageId)},template_message_id.is.null`,
    )
    .select(GATE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data;
}
