import { getRepositoryReadClient } from "@/lib/db/readAccess";
/*
 * Links já usados pela organização, um por nome e destino, do mais recente
 * para o mais antigo. A vista tracked_link_library aplica o RLS de quem
 * consulta; a query mantém também o filtro pela organização (org_id).
 */
export async function getTrackedLinkLibraryByOrg(orgId, { limit = 200 } = {}) {
  const supabaseAdmin = getRepositoryReadClient();
  const { data, error } = await supabaseAdmin
    .from("tracked_link_library")
    .select("link_key, link_label, destination_url, last_used_at")
    .eq("org_id", orgId)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
