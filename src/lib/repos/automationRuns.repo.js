// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
import { getSupabaseAdminClient } from "@/lib/db/admin";

const sb = getSupabaseAdminClient();

export async function createAutomationRun(row) {
  const { data, error } = await sb
    .from("automation_run")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createAutomationRunIfMissing(row) {
  try {
    return await createAutomationRun(row);
  } catch (error) {
    if (error?.code === "23505") {
      return null;
    }
    throw error;
  }
}

export async function getAutomationRunById(id) {
  const { data, error } = await sb
    .from("automation_run")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getAutomationRunForScheduledBroadcast({
  id,
  organizationId,
  scheduledBroadcastId,
}) {
  if (!id || !organizationId || !scheduledBroadcastId) return null;

  const { data, error } = await sb
    .from("automation_run")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("scheduled_broadcast_id", scheduledBroadcastId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getDueAutomationRuns(limit = 100, { organizationId = null } = {}) {
  const nowIso = new Date().toISOString();

  let query = sb
    .from("automation_run")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (organizationId != null) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function markAutomationRunMaterialized(id, scheduledBroadcastId) {
  const { data, error } = await sb
    .from("automation_run")
    .update({
      status: "materialized",
      scheduled_broadcast_id: scheduledBroadcastId,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "queued")
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function markAutomationRunProcessing(id, context = {}) {
  let query = sb
    .from("automation_run")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["queued", "materialized"]);

  if (context.organizationId) {
    query = query.eq("organization_id", context.organizationId);
  }
  if (context.scheduledBroadcastId) {
    query = query.eq("scheduled_broadcast_id", context.scheduledBroadcastId);
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function markAutomationRunSent(id, context = {}) {
  let query = sb
    .from("automation_run")
    .update({
      status: "sent",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (context.organizationId) {
    query = query.eq("organization_id", context.organizationId);
  }
  if (context.scheduledBroadcastId) {
    query = query.eq("scheduled_broadcast_id", context.scheduledBroadcastId);
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function markAutomationRunFailed(
  id,
  lastError = null,
  context = {},
) {
  let query = sb
    .from("automation_run")
    .update({
      status: "failed",
      last_error: lastError,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (context.organizationId) {
    query = query.eq("organization_id", context.organizationId);
  }
  if (context.scheduledBroadcastId) {
    query = query.eq("scheduled_broadcast_id", context.scheduledBroadcastId);
  }

  const { data, error } = await query
    .select()
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function markAutomationRunCancelled(id, lastError = null) {
  const { data, error } = await sb
    .from("automation_run")
    .update({
      status: "cancelled",
      last_error: lastError,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
