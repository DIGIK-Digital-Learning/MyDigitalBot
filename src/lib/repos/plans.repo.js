import { getSupabaseAdminClient } from "@/lib/db/admin";

/**
 * A organização com o plano dela. A tabela plan só é acessível pelo servidor
 * (service role), por isso esta leitura usa o cliente de administração.
 */
export async function getOrganizationPlan(orgId) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("organization")
    .select("id, plan_started_at, max_users_override, plan:plan_id (*)")
    .eq("id", orgId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* Todos os planos, do Demo ao Interno (área de administração, #208). */
export async function listPlans() {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("plan")
    .select("*")
    .order("level", { ascending: true });

  if (error) throw error;
  return data || [];
}

/* Todas as organizações com o plano (área de administração, #208). */
export async function listOrganizationsWithPlan() {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("organization")
    .select("id, name, plan_started_at, max_users_override, plan_id")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getPlanById(planId) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("plan")
    .select("*")
    .eq("id", planId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/*
 * Muda o plano de uma organização. O início do plano passa a ser agora: é
 * daí que conta a duração da Demo (7 dias).
 */
export async function setOrganizationPlan(orgId, planId, { now = new Date() } = {}) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("organization")
    .update({ plan_id: planId, plan_started_at: now.toISOString() })
    .eq("id", orgId)
    .select("id, name, plan_id, plan_started_at")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* Grava os limites de um plano (`patch` já com os nomes das colunas). */
export async function updatePlan(planId, patch) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("plan")
    .update(patch)
    .eq("id", planId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}
