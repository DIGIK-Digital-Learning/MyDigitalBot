import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";

/*
 * Links rastreados guardados da organização (#189): um por nome e destino,
 * gravados ao enviar, agendar ou criar uma corrente. Eliminar só preenche
 * `deleted_at`: o link deixa de aparecer e de contar para o limite.
 */

/** Links ativos, do mais recente para o mais antigo. */
export async function listSavedTrackedLinks(orgId, { limit = 200 } = {}) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("tracked_link_saved")
    .select("id, link_key, link_label, destination_url, created_at, last_used_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Todos os links guardados, incluindo os eliminados (a página dos links
 * mostra-os no fim, porque as estatísticas ficam).
 */
export async function listAllSavedTrackedLinks(orgId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("tracked_link_saved")
    .select(
      "id, link_key, link_label, destination_url, created_at, last_used_at, deleted_at",
    )
    .eq("org_id", orgId)
    .order("last_used_at", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/*
 * As linhas dos envios com links (uma por destinatário e por envio) e os
 * cliques de cada uma, para as estatísticas por link.
 */
export async function getTrackedLinkSendRows(orgId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("tracked_link")
    .select(
      "id, channel, recipient_user_id, scheduled_broadcast_id, send_group_id, destination_url, link_label, created_at, tracked_link_event (id)",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Quantos links ativos tem a organização (o "37 / 100"). */
export async function countSavedTrackedLinks(orgId) {
  const sb = getSupabaseAdminClient();
  const { count, error } = await sb
    .from("tracked_link_saved")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Grava os links de um envio (função save_tracked_links). Os novos só
 * entram se couberem no limite. Devolve `{ ok, used, limit, added }`.
 */
export async function saveTrackedLinks(orgId, links, limit) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb.rpc("save_tracked_links", {
    p_org_id: Number(orgId),
    p_links: links,
    p_limit: limit ?? null,
  });

  if (error) throw error;

  return {
    ok: Boolean(data?.ok),
    used: Number(data?.used) || 0,
    limit: data?.limit ?? null,
    added: Number(data?.added) || 0,
  };
}

/**
 * Elimina (esconde) um link, se não estiver numa agendada à espera nem numa
 * corrente a decorrer. Devolve `{ ok, reason }` ("not_found", "scheduled",
 * "chain").
 */
export async function deleteSavedTrackedLink(orgId, id) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb.rpc("delete_tracked_link_saved", {
    p_org_id: Number(orgId),
    p_id: id,
  });

  if (error) throw error;
  return { ok: Boolean(data?.ok), reason: data?.reason ?? null };
}
