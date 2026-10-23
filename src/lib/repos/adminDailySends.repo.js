import { getSupabaseAdminClient } from "@/lib/db/admin";

/*
 * Envios do administrador que contam para o limite diário (#188). Uma linha
 * por envio; a contagem do dia soma as linhas desde o início do dia.
 */

/**
 * Conta e grava o envio numa só operação (função claim_admin_daily_send).
 * Devolve `{ ok, used, limit }`: `ok` false quando não cabe.
 */
export async function claimAdminDailySend({
  organizationId,
  channel,
  sourceType,
  sourceId = null,
  units = 1,
  limit,
  since,
  claimKey,
}) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb.rpc("claim_admin_daily_send", {
    p_organization_id: Number(organizationId),
    p_channel: channel,
    p_source_type: sourceType,
    p_source_id: sourceId === null ? null : String(sourceId),
    p_units: units,
    p_limit: limit ?? null,
    p_since: since.toISOString(),
    p_claim_key: claimKey,
  });

  if (error) throw error;

  return {
    ok: Boolean(data?.ok),
    used: Number(data?.used) || 0,
    limit: data?.limit ?? null,
  };
}

/* Liga o envio à agendada ou à corrente, depois de esta ser criada. */
export async function setAdminDailySendSource(claimKey, sourceId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("admin_daily_send")
    .update({ source_id: String(sourceId) })
    .eq("claim_key", claimKey);

  if (error) throw error;
}

/* Devolve o envio: o pedido falhou antes de chegar a alguém. */
export async function releaseAdminDailySend(claimKey) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("admin_daily_send")
    .delete()
    .eq("claim_key", claimKey);

  if (error) throw error;
}

/*
 * Devolve o envio de uma agendada cancelada ou eliminada, só se foi contado
 * hoje: noutro dia o contador já não olha para ele.
 */
export async function refundScheduledSend(scheduledBroadcastId, since) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("admin_daily_send")
    .delete()
    .eq("source_type", "scheduled_broadcast")
    .eq("source_id", String(scheduledBroadcastId))
    .gte("counted_at", since.toISOString());

  if (error) throw error;
}

/* Envios de hoje por canal: `{ whatsapp, teams }`. */
export async function countAdminDailySends(organizationId, since) {
  const sb = getSupabaseAdminClient();
  const { data, error } = await sb
    .from("admin_daily_send")
    .select("channel, units")
    .eq("organization_id", Number(organizationId))
    .gte("counted_at", since.toISOString());

  if (error) throw error;

  const totals = { whatsapp: 0, teams: 0 };
  for (const row of data || []) {
    if (row.channel in totals) totals[row.channel] += Number(row.units) || 0;
  }
  return totals;
}
