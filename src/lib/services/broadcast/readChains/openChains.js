import {
  closeMessageChain,
  deleteUnsentChainQuestion,
  getMessageChainById,
  listMessageChainSteps,
  listOpenMessageChains,
  messageChainStepTouched,
  removeMessageChainStep,
  updateMessageChainStepPayload,
} from "@/lib/repos/messageChain.repo";
import {
  refundChainSend,
  refundOneChainSend,
} from "@/lib/repos/adminDailySends.repo";
import { dailySendsDayStart } from "@/lib/plans/dailySends";
import { checkMessageContent } from "@/lib/services/plans/planLimits";

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

/* Uma corrente tem sempre pelo menos 2 mensagens (como ao criar). */
export const MIN_CHAIN_STEPS = 2;

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
  const deliveries = row.message_chain_delivery || [];

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
      /* O texto inteiro, para o editar. */
      message: String(step.payload?.message || ""),
      fileCount:
        (step.payload?.files?.length || 0) +
        (step.payload?.imageUrls?.length || 0),
      hasQuestion: Boolean(step.payload?.question),
      delayMinutes: Number(step.payload?.delayAfterPreviousReadMinutes) || 0,
      /* Quantos destinatários já receberam esta mensagem. */
      reached: recipients.filter(
        (recipient) => Number(recipient.current_step_index) >= step.step_index,
      ).length,
      /*
       * Já não se tira: alguém a recebeu, ou tem esta ou uma seguinte marcada
       * para sair.
       */
      locked:
        recipients.some(
          (recipient) =>
            Number(recipient.current_step_index) >= step.step_index,
        ) ||
        deliveries.some(
          (delivery) => Number(delivery.step_index) >= step.step_index,
        ),
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

/**
 * Tira uma mensagem de uma corrente (as seguintes sobem um número).
 *
 * - Agendada: qualquer mensagem; se a corrente foi criada hoje, devolve 1
 *   envio do dia (#188).
 * - A decorrer: só uma mensagem a que ninguém chegou nem está marcada para
 *   sair; não devolve envios.
 * - Fica sempre com pelo menos 2 mensagens; para tirar mais, cancela-se.
 * - A pergunta da mensagem, que nunca saiu, sai também das Perguntas.
 *
 * Devolve `{ stepCount, chain }`, ou `{ code, status }` quando não é possível.
 */
export async function removeChainStep(
  orgId,
  chainId,
  stepIndex,
  { now = new Date(), deps = {} } = {},
) {
  const getChain = deps.getMessageChainById || getMessageChainById;
  const listSteps = deps.listMessageChainSteps || listMessageChainSteps;
  const touched = deps.messageChainStepTouched || messageChainStepTouched;
  const remove = deps.removeMessageChainStep || removeMessageChainStep;
  const deleteQuestion =
    deps.deleteUnsentChainQuestion || deleteUnsentChainQuestion;
  const refundOne = deps.refundOneChainSend || refundOneChainSend;

  const chain = await getChain(chainId);
  if (!chain || Number(chain.organization_id) !== Number(orgId)) {
    return { code: "CHAIN_NOT_FOUND", status: 404 };
  }

  if (chain.status === "processing") {
    return { code: "CHAIN_SENDING", status: 409 };
  }
  if (!["scheduled", "active"].includes(chain.status)) {
    return { code: "CHAIN_NOT_OPEN", status: 409 };
  }

  const steps = await listSteps(chainId);
  const step = steps.find((s) => Number(s.step_index) === Number(stepIndex));
  if (!step) return { code: "STEP_NOT_FOUND", status: 404 };

  if (steps.length <= MIN_CHAIN_STEPS) {
    return { code: "CHAIN_MIN_STEPS", status: 409 };
  }

  if (await touched({ chainId, stepId: step.id, stepIndex: step.step_index })) {
    return { code: "STEP_ALREADY_SENT", status: 409 };
  }

  await remove({ chainId, stepId: step.id, stepIndex: step.step_index, steps });

  if (step.payload?.questionId) {
    await deleteQuestion({
      questionId: step.payload.questionId,
      organizationId: orgId,
    });
  }

  if (chain.status === "scheduled") {
    await refundOne(chainId, dailySendsDayStart(now));
  }

  return { stepCount: steps.length - 1, chain };
}

/**
 * Muda o texto de uma mensagem da corrente. Ficheiros, imagens, links e o
 * tempo entre mensagens ficam como estão.
 *
 * - Agendada: qualquer mensagem; a decorrer: só uma a que ninguém chegou nem
 *   está marcada para sair (a mesma regra de tirar).
 * - Uma mensagem com pergunta não se edita aqui: o que sai é a pergunta, não
 *   o texto.
 * - O texto respeita o limite de caracteres do plano (#187) e só fica vazio
 *   se a mensagem tiver ficheiros ou imagens.
 *
 * Devolve `{ chain, changed }`, ou `{ code, status, body? }` quando não é
 * possível.
 */
export async function editChainStep(
  orgId,
  chainId,
  stepIndex,
  message,
  { deps = {} } = {},
) {
  const getChain = deps.getMessageChainById || getMessageChainById;
  const listSteps = deps.listMessageChainSteps || listMessageChainSteps;
  const touched = deps.messageChainStepTouched || messageChainStepTouched;
  const save =
    deps.updateMessageChainStepPayload || updateMessageChainStepPayload;
  const checkContent = deps.checkMessageContent || checkMessageContent;

  const chain = await getChain(chainId);
  if (!chain || Number(chain.organization_id) !== Number(orgId)) {
    return { code: "CHAIN_NOT_FOUND", status: 404 };
  }

  if (chain.status === "processing") {
    return { code: "CHAIN_SENDING", status: 409 };
  }
  if (!["scheduled", "active"].includes(chain.status)) {
    return { code: "CHAIN_NOT_OPEN", status: 409 };
  }

  const steps = await listSteps(chainId);
  const step = steps.find((s) => Number(s.step_index) === Number(stepIndex));
  if (!step) return { code: "STEP_NOT_FOUND", status: 404 };

  const payload = step.payload || {};
  if (payload.question || payload.questionId) {
    return { code: "STEP_HAS_QUESTION", status: 409 };
  }

  const text = String(message ?? "");
  const files = Array.isArray(payload.files) ? payload.files : [];
  const images = Array.isArray(payload.imageUrls) ? payload.imageUrls : [];
  if (!text.trim() && files.length === 0 && images.length === 0) {
    return { code: "STEP_EMPTY", status: 400 };
  }

  if (text === String(payload.message || "")) {
    return { chain, changed: false };
  }

  const content = await checkContent(orgId, { message: text, files });
  if (content.body) {
    return { code: content.body.code, status: 400, body: content.body };
  }

  if (await touched({ chainId, stepId: step.id, stepIndex: step.step_index })) {
    return { code: "STEP_ALREADY_SENT", status: 409 };
  }

  await save({
    chainId,
    stepId: step.id,
    payload: { ...payload, message: text },
  });

  return { chain, changed: true };
}
