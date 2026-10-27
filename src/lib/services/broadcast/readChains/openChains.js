import {
  closeMessageChain,
  getMessageChainById,
  listOpenMessageChains,
} from "@/lib/repos/messageChain.repo";
import { refundChainSend } from "@/lib/repos/adminDailySends.repo";
import { dailySendsDayStart } from "@/lib/plans/dailySends";

/*
 * Correntes nas Mensagens agendadas: as que esperam pela hora (podem ser
 * canceladas) e as que estão a decorrer (podem ser paradas). As concluídas
 * não aparecem.
 */

const PREVIEW_LENGTH = 140;

/* Texto curto de uma mensagem, sem formatação, para a lista. */
export function previewText(value) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > PREVIEW_LENGTH
    ? `${text.slice(0, PREVIEW_LENGTH - 1)}…`
    : text;
}

function stepPreview(payload) {
  return previewText(payload?.message) || previewText(payload?.question?.body);
}

/* O estado mostrado: à espera da hora, a sair agora ou a decorrer. */
function displayStatus(status) {
  if (status === "scheduled") return "scheduled";
  if (status === "processing") return "sending";
  return "running";
}

export function summarizeChain(row) {
  const steps = (row.message_chain_step || [])
    .slice()
    .sort((a, b) => a.step_index - b.step_index);
  const recipients = row.message_chain_recipient || [];

  return {
    id: row.id,
    kind: "chain",
    channel: row.channel,
    status: displayStatus(row.status),
    scheduledFor: row.scheduled_for || null,
    timezone: row.timezone || null,
    createdAt: row.created_at || null,
    startedAt: row.started_at || null,
    createdByUserId: row.created_by_user_id || null,
    recipientCount: row.recipient_count || recipients.length,
    stepCount: steps.length,
    preview: stepPreview(steps[0]?.payload),
    steps: steps.map((step) => ({
      index: step.step_index,
      preview: stepPreview(step.payload),
      fileCount:
        (step.payload?.files?.length || 0) +
        (step.payload?.imageUrls?.length || 0),
      hasQuestion: Boolean(step.payload?.question),
      delayMinutes: Number(step.payload?.delayAfterPreviousReadMinutes) || 0,
      /* Quantos destinatários já receberam esta mensagem. */
      reached: recipients.filter(
        (recipient) => Number(recipient.current_step_index) >= step.step_index,
      ).length,
    })),
    recipientsWaiting: recipients.filter((r) => r.status === "active").length,
    recipientsDone: recipients.filter((r) => r.status === "completed").length,
  };
}

export async function listOpenChains(orgId, { deps = {} } = {}) {
  const list = deps.listOpenMessageChains || listOpenMessageChains;
  const rows = await list(orgId);

  return (
    rows
      .map(summarizeChain)
      /* Uma corrente a decorrer sem ninguém à espera já terminou. */
      .filter(
        (chain) => chain.status !== "running" || chain.recipientsWaiting > 0,
      )
  );
}

/**
 * Cancela uma corrente que ainda não começou, ou para uma que está a
 * decorrer (as mensagens que faltam já não saem).
 *
 * Envios do dia (#188): cancelar uma agendada no dia em que foi criada
 * devolve os N envios; parar uma corrente que já começou não devolve nada.
 *
 * Devolve `{ action: "cancelled" | "stopped", chain }`, ou `{ code, status }`
 * quando não é possível.
 */
export async function closeChain(
  orgId,
  chainId,
  { now = new Date(), deps = {} } = {},
) {
  const getChain = deps.getMessageChainById || getMessageChainById;
  const close = deps.closeMessageChain || closeMessageChain;
  const refund = deps.refundChainSend || refundChainSend;

  const chain = await getChain(chainId);
  if (!chain || Number(chain.organization_id) !== Number(orgId)) {
    return { code: "CHAIN_NOT_FOUND", status: 404 };
  }

  if (chain.status === "scheduled") {
    const closed = await close({
      chainId,
      fromStatus: "scheduled",
      toStatus: "cancelled",
      reason: "Cancelled by admin",
    });
    /* O cron começou a enviá-la entretanto. */
    if (!closed) return { code: "CHAIN_SENDING", status: 409 };

    await refund(chainId, dailySendsDayStart(now));
    return { action: "cancelled", chain: closed };
  }

  if (chain.status === "processing") {
    return { code: "CHAIN_SENDING", status: 409 };
  }

  if (chain.status === "active") {
    const closed = await close({
      chainId,
      fromStatus: "active",
      toStatus: "stopped",
      reason: "Stopped by admin",
    });
    if (!closed) return { code: "CHAIN_NOT_OPEN", status: 409 };

    return { action: "stopped", chain: closed };
  }

  return { code: "CHAIN_NOT_OPEN", status: 409 };
}
