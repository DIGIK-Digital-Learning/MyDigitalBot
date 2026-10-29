import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
export async function createAutomationRule(row) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb
    .from("automation_rule")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* Quantas automações tem a organização, ativas e inativas (limite do plano, #186). */
export async function countAutomationRulesByOrg(organizationId) {
  const sb = getSupabaseAdminClient();
  const { count, error } = await sb
    .from("automation_rule")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", Number(organizationId));

  if (error) throw error;
  return count ?? 0;
}

export async function getAutomationRuleById(id) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("automation_rule")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getOrgAutomationRules(organizationId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("automation_rule")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getActiveAutomationRules({
  organizationId = null,
  triggerType = null,
}) {
  const sb = getRepositoryReadClient();
  let query = sb
    .from("automation_rule")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (organizationId != null) {
    query = query.eq("organization_id", organizationId);
  }

  if (triggerType) {
    query = query.eq("trigger_type", triggerType);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function findActiveInactivityRuleConflict({
  organizationId,
  channel,
  assistantId = null,
  excludeRuleId = null,
}) {
  const sb = getSupabaseAdminClient();
  let query = sb
    .from("automation_rule")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("trigger_type", "user.inactive")
    .eq("channel", channel)
    .eq("is_active", true)
    .limit(1);

  if (excludeRuleId) {
    query = query.neq("id", excludeRuleId);
  }

  if (assistantId == null) {
    query = query.is("assistant_id", null);
  } else {
    query = query.eq("assistant_id", assistantId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data?.[0] ?? null;
}

export async function assertNoActiveInactivityRuleConflict({
  organizationId,
  channel,
  assistantId = null,
  excludeRuleId = null,
}) {
  const conflict = await findActiveInactivityRuleConflict({
    organizationId,
    channel,
    assistantId,
    excludeRuleId,
  });

  if (!conflict) return null;

  const scope =
    assistantId == null ? "Any assistant fallback" : `assistant ${assistantId}`;

  const err = new Error(
    `An active inactivity rule already exists for ${channel} on ${scope}.`,
  );
  err.code = "INACTIVITY_RULE_CONFLICT";
  err.status = 409;
  throw err;
}

export async function updateAutomationRule(id, patch) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb
    .from("automation_rule")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAutomationRule(id) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb.from("automation_rule").delete().eq("id", id);
  if (error) throw error;
  return true;
}
