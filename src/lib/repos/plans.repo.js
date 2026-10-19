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
