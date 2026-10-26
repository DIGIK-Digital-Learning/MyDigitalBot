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
    .select("id, name, owner_user_id, plan_started_at, max_users_override, plan_id")
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

/* Muda só o início do plano (prolongar a Demo sem mudar de plano). */
export async function setOrganizationPlanStart(orgId, startedAt) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb
    .from("organization")
    .update({ plan_started_at: startedAt.toISOString() })
    .eq("id", orgId)
    .select("id, plan_id, plan_started_at")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/*
 * O email do dono de cada organização, para a equipa DIGIK saber a quem
 * ligar. Devolve `{ [ownerUserId]: email }`.
 */
export async function listOwnerEmails(ownerUserIds) {
  const wanted = new Set(ownerUserIds.filter(Boolean));
  if (!wanted.size) return {};

  const sb = getSupabaseAdminClient();
  const emails = {};

  for (let page = 1; page <= 20 && Object.keys(emails).length < wanted.size; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    for (const user of data?.users || []) {
      if (wanted.has(user.id)) emails[user.id] = user.email ?? null;
    }
    if ((data?.users || []).length < 1000) break;
  }

  return emails;
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
