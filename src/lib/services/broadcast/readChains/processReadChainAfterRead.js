import { isReadChainsEnabled } from "@/lib/repos/organizationMessagingFeature.repo";
import {
  completeMessageChainRecipient,
  createMessageChainDelivery,
  getMessageChainById,
  getMessageChainDelivery,
  getMessageChainRecipientById,
  getMessageChainStep,
  getValidatedMessageChainContext,
  markMessageChainDeliveryRead,
} from "@/lib/repos/messageChain.repo";
import { getOrgLimits } from "@/lib/services/plans/planLimits";
import { sendReadChainStep } from "./sendReadChainStep";

function getDelayAfterPreviousReadMinutes(stepPayload) {
  const raw =
    stepPayload?.delayAfterPreviousReadMinutes ??
    stepPayload?.delayAfterReadMinutes ??
    0;

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export async function processReadChainAfterRead(message) {
  if (!message?.message_chain_id) {
    return {
      ok: true,
      skipped: true,
      reason: "Message is not part of a read chain.",
    };
  }

  if (
    !message.message_chain_recipient_id ||
    !message.message_chain_step_id ||
    !message.message_chain_step_index
  ) {
    return {
      ok: false,
      skipped: true,
      reason: "Message is missing chain recipient or step metadata.",
    };
  }

  const enabled = await isReadChainsEnabled({
    organizationId: message.organization_id,
    channel: message.channel || "whatsapp",
  });

  if (!enabled) {
    return {
      ok: true,
      skipped: true,
      reason: "Read chains are disabled for this organization.",
    };
  }

  const chain = await getMessageChainById(message.message_chain_id);

  if (!chain || chain.status !== "active") {
    return {
      ok: true,
      skipped: true,
      reason: "Chain is not active.",
    };
  }

  const chainRecipient = await getMessageChainRecipientById(
    message.message_chain_recipient_id,
  );

  if (!chainRecipient || chainRecipient.status !== "active") {
    return {
      ok: true,
      skipped: true,
      reason: "Chain recipient is not active.",
    };
  }

  const currentStepIndex = Number(message.message_chain_step_index);
  const context = await getValidatedMessageChainContext({
    chainId: message.message_chain_id,
    chainStepId: message.message_chain_step_id,
    chainRecipientId: message.message_chain_recipient_id,
    stepIndex: currentStepIndex,
    userId: message.user_id,
    organizationId: message.organization_id,
  });

  if (!context) {
    return {
      ok: false,
      skipped: true,
      reason: "Message chain metadata does not match its organization and user.",
    };
  }

  const nextStepIndex = currentStepIndex + 1;

  await markMessageChainDeliveryRead({
    chainId: chain.id,
    chainRecipientId: message.message_chain_recipient_id,
    stepIndex: currentStepIndex,
    readAt: message.read_at || new Date(),
  });

  const nextStep = await getMessageChainStep({
    chainId: message.message_chain_id,
    stepIndex: nextStepIndex,
  });

  if (!nextStep) {
    await completeMessageChainRecipient({
      chainId: chain.id,
      chainRecipientId: message.message_chain_recipient_id,
      userId: message.user_id,
      reason: "All chain steps completed.",
    });

    return {
      ok: true,
      completed: true,
      nextStepSent: false,
    };
  }

  const existingNextDelivery = await getMessageChainDelivery({
    chainRecipientId: message.message_chain_recipient_id,
    stepIndex: nextStepIndex,
  });

  if (existingNextDelivery) {
    return {
      ok: true,
      skipped: true,
      reason: "Next step was already created, scheduled, or sent.",
      nextStepIndex,
      existingStatus: existingNextDelivery.status,
    };
  }

  /*
   * A Demo terminou (#209): a leitura fica registada, mas a corrente não
   * avança para o passo seguinte.
   */
  const { expired } = await getOrgLimits(message.organization_id);

  if (expired) {
    return {
      ok: true,
      skipped: true,
      reason: "Organization plan has expired.",
      nextStepIndex,
    };
  }

  const delayMinutes = getDelayAfterPreviousReadMinutes(nextStep.payload);

  if (delayMinutes > 0) {
    const dueAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    const scheduledDelivery = await createMessageChainDelivery({
      chainId: chain.id,
      chainStepId: nextStep.id,
      chainRecipientId: chainRecipient.id,
      userId: chainRecipient.user_id,
      messageDbId: null,
      providerMessageId: null,
      stepIndex: nextStepIndex,
      status: "scheduled",
      sentAt: null,
      readAt: null,
      failedAt: null,
      dueAt,
      errorMessage: null,
    });

    return {
      ok: true,
      completed: false,
      scheduled: true,
      nextStepSent: false,
      nextStepIndex,
      delayMinutes,
      dueAt: dueAt.toISOString(),
      delivery: scheduledDelivery,
    };
  }

  const sendResult = await sendReadChainStep({
    chain,
    chainRecipient,
    chainStep: nextStep,
    stepIndex: nextStepIndex,
  });

  return {
    ok: sendResult.ok,
    completed: false,
    nextStepSent: sendResult.sent,
    nextStepIndex,
    sendResult,
  };
}
