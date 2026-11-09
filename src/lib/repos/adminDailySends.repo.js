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

/*
 * Devolve os N envios de uma corrente agendada cancelada, só se foram
 * contados hoje (#188), como nas agendadas.
 */
export async function refundChainSend(chainId, since) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("admin_daily_send")
    .delete()
    .eq("source_type", "message_chain")
    .eq("source_id", String(chainId))
    .gte("counted_at", since.toISOString());

  if (error) throw error;
}

/* A linha de envios de uma corrente, se foi contada desde `since` (#188). */
async function chainSendRow(sb, chainId, since) {
  const { data, error } = await sb
    .from("admin_daily_send")
    .select("id, units")
    .eq("source_type", "message_chain")
    .eq("source_id", String(chainId))
    .gte("counted_at", since.toISOString())
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* Grava os envios de uma corrente; com 0, a linha sai. */
async function writeChainSends(sb, row, units) {
  const { error } = await (units > 0
    ? sb.from("admin_daily_send").update({ units }).eq("id", row.id)
    : sb.from("admin_daily_send").delete().eq("id", row.id));

  if (error) throw error;
}

/*
 * Devolve envios de uma corrente contada hoje (#188), um por cada mensagem que
 * já não vai sair: tirada, ou a 1.ª quando falhou para toda a gente.
 */
export async function refundChainStepSends(chainId, since, count = 1) {
  if (count < 1) return;

  const sb = getSupabaseAdminClient();
  const row = await chainSendRow(sb, chainId, since);
  if (!row) return;

  await writeChainSends(sb, row, Math.max(Number(row.units) - count, 0));
}

/*
 * Ao parar uma corrente contada hoje: fica a contar só as mensagens que
 * chegaram a alguém (ou estão marcadas para sair). Nunca sobe.
 */
export async function keepChainSends(chainId, since, units) {
  const sb = getSupabaseAdminClient();
  const row = await chainSendRow(sb, chainId, since);
  if (!row || units >= Number(row.units)) return;

  await writeChainSends(sb, row, Math.max(units, 0));
}
