import { getSupabaseAdminClient } from "@/lib/db/admin";

/*
 * Mensagens do colaborador que contam para o limite semanal. Uma linha por
 * mensagem; a contagem da semana soma as linhas desde o início da semana.
 */

/**
 * Conta a mensagem e diz se cabe, numa só operação (função
 * claim_collaborator_message). Devolve `{ ok, used, limit, notify }`:
 * `notify` é true só na primeira mensagem da semana que já não cabe.
 */
export async function claimCollaboratorMessage({
  organizationId,
  userId,
  channel,
  kind,
  sourceId = null,
  limit,
  since,
}) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb.rpc("claim_collaborator_message", {
    p_organization_id: Number(organizationId),
    p_user_id: Number(userId),
    p_channel: channel,
    p_kind: kind,
    p_source_id: sourceId === null ? null : String(sourceId),
    p_limit: limit ?? null,
    p_since: since.toISOString(),
  });

  if (error) throw error;

  return {
    ok: Boolean(data?.ok),
    used: Number(data?.used) || 0,
    limit: data?.limit ?? null,
    notify: Boolean(data?.notify),
  };
}

/* Uso da semana por colaborador: `{ [userId]: { whatsapp, teams } }`. */
export async function getCollaboratorWeeklyUsage(organizationId, since) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb.rpc("collaborator_weekly_usage", {
    p_organization_id: Number(organizationId),
    p_since: since.toISOString(),
  });

  if (error) throw error;

  const usage = {};
  for (const row of data || []) {
    const entry = (usage[row.user_id] ||= { whatsapp: 0, teams: 0 });
    if (row.channel in entry) entry[row.channel] = Number(row.used) || 0;
  }
  return usage;
}
