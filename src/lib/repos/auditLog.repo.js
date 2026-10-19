import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
const TABLE = "audit_log";

/**
 * Insere uma linha no histórico de atividade.
 *
 * Recebe a linha já no formato da tabela (ver buildAuditRow).
 */
export async function insertAuditLog(row) {
  const sb = getSupabaseAdminClient();

  const { data, error } = await sb.from(TABLE).insert(row).select().single();

  if (error) {
    throw new Error(`${TABLE}: ${error.message}`);
  }

  return data;
}

/**
 * Lista o histórico de uma organização, do mais recente para o mais
 * antigo, com filtros opcionais e paginação.
 *
 * Devolve as linhas da página pedida e o total de linhas que
 * cumprem os filtros, para a UI saber quantas páginas existem.
 */
export async function getOrgAuditLog(
  organizationId,
  {
    area = null,
    action = null,
    from = null,
    to = null,
    page = 1,
    pageSize = 25,
  } = {},
) {
  const sb = getRepositoryReadClient();

  const offset = (page - 1) * pageSize;

  let query = sb
    .from(TABLE)
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (action) {
    query = query.eq("action", action);
  } else if (area) {
    query = query.like("action", `${area}.%`);
  }

  if (from) {
    query = query.gte("created_at", from);
  }

  if (to) {
    query = query.lte("created_at", to);
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new Error(`${TABLE}: ${error.message}`);
  }

  return {
    items: data ?? [],
    total: count ?? 0,
  };
}
