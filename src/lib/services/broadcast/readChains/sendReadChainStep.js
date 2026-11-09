import { sendWhatsappBroadcast } from "@/lib/services/broadcast/sendWhatsappBroadcast";
import { sendTeamsBroadcast } from "@/lib/services/broadcast/sendTeamsBroadcast";
import { createMessage } from "@/lib/repos/messages.repo";
import { getLatestUserThreadForChannel } from "@/lib/repos/threads.repo";
import {
  createMessageChainDelivery,
  markMessageChainDeliveryFailed,
  updateMessageChainRecipientProgress,
} from "@/lib/repos/messageChain.repo";

function getResultError(result) {
  if (!result) return "Unknown send error.";

  return (
    result.error ||
    result.data?.error ||
    result.data?.message ||
    result.data?.detail ||
    `Send failed with status ${result.status || "unknown"}.`
  );
}

function getStepContentForMessageRow({ stepPayload, result, stepIndex }) {
  const resolved = String(result?.resolvedMessage || "").trim();
  if (resolved) return resolved;

  const raw = String(stepPayload?.message || "").trim();
  if (raw) return raw;

  return `[Read chain step ${stepIndex}]`;
}

async function recordStepFailure({
  chain,
  chainRecipient,
  chainStep,
  stepIndex,
  errorMessage,
  providerMessageId = null,
}) {
  await createMessageChainDelivery({
    chainId: chain.id,
    chainStepId: chainStep.id,
    chainRecipientId: chainRecipient.id,
    userId: chainRecipient.user_id,
    messageDbId: null,
    providerMessageId,
    stepIndex,
    status: "failed",
    sentAt: null,
    failedAt: new Date(),
    errorMessage,
  });

  await markMessageChainDeliveryFailed({
    chainRecipientId: chainRecipient.id,
    stepIndex,
    errorMessage,
  });
}

/*
 * No Teams não há janela de 24h nem template: o passo sai logo. O
 * sendTeamsBroadcast grava a mensagem com o id do Teams e os dados da
 * cadeia, e o evento de leitura faz avançar para o passo seguinte.
 */
async function sendTeamsChainStep({
  chain,
  chainRecipient,
  chainStep,
  stepIndex,
}) {
  const stepPayload = chainStep.payload || {};

  const result = await sendTeamsBroadcast({
    orgId: chain.organization_id,
    userIds: [chainRecipient.user_id],
    message: stepPayload.message || "",
    files: Array.isArray(stepPayload.files) ? stepPayload.files : [],
    imageUrls: Array.isArray(stepPayload.imageUrls)
      ? stepPayload.imageUrls
      : [],
    trackedLinks: Array.isArray(stepPayload.trackedLinks)
      ? stepPayload.trackedLinks
      : [],
    /* Pergunta do passo, criada ao criar a cadeia e partilhada por todos. */
    questionId: stepPayload.questionId || null,
    scheduledBroadcastId: null,
    sendGroupId: `${chain.id}-step-${stepIndex}`,
    createdByUserId: chain.created_by_user_id || null,
    chainMetadata: {
      messageChainId: chain.id,
      messageChainStepId: chainStep.id,
      messageChainRecipientId: chainRecipient.id,
      messageChainStepIndex: stepIndex,
    },
  });

  const recipientResult = Array.isArray(result?.results)
    ? result.results[0]
    : null;

  if (!recipientResult?.ok) {
    const errorMessage = getResultError(recipientResult);

    await recordStepFailure({
      chain,
      chainRecipient,
      chainStep,
      stepIndex,
      errorMessage,
    });

    return {
      ok: false,
      sent: false,
      waitingForReply: false,
      kind: "failed",
      stepIndex,
      error: errorMessage,
      result: recipientResult,
    };
  }

  const tracked = Boolean(recipientResult.messageRowId);

  await createMessageChainDelivery({
    chainId: chain.id,
    chainStepId: chainStep.id,
    chainRecipientId: chainRecipient.id,
    userId: chainRecipient.user_id,
    messageDbId: recipientResult.messageRowId || null,
    providerMessageId: recipientResult.providerMessageId || null,
    stepIndex,
    status: "sent",
    sentAt: new Date(),
    errorMessage: tracked
      ? null
      : "Message was sent, but it could not be recorded. Read tracking may not advance.",
  });

  await updateMessageChainRecipientProgress({
    chainId: chain.id,
    chainRecipientId: chainRecipient.id,
    userId: chainRecipient.user_id,
    currentStepIndex: stepIndex,
    status: "active",
  });

  return {
    ok: true,
    sent: true,
    waitingForReply: false,
    kind: "teams",
    stepIndex,
    result: recipientResult,
    warning: tracked
      ? null
      : "The message could not be recorded. Read tracking may not advance.",
  };
}

export async function sendReadChainStep({
  chain,
  chainRecipient,
  chainStep,
  stepIndex,
}) {
  if (!chain?.id) {
    throw new Error("chain is required");
  }

  if (!chainRecipient?.id || !chainRecipient?.user_id) {
    throw new Error("chainRecipient with user_id is required");
  }

  if (!chainStep?.id || !chainStep?.payload) {
    throw new Error("chainStep with payload is required");
  }

  if (chain.channel === "teams") {
    return sendTeamsChainStep({ chain, chainRecipient, chainStep, stepIndex });
  }

  const stepPayload = chainStep.payload || {};

  const result = await sendWhatsappBroadcast({
    orgId: chain.organization_id,
    message: stepPayload.message || "",
    files: Array.isArray(stepPayload.files) ? stepPayload.files : [],
    imageUrls: Array.isArray(stepPayload.imageUrls)
      ? stepPayload.imageUrls
      : [],
    recipients: [
      {
        userId: chainRecipient.user_id,
      },
    ],
    trackedLinks: Array.isArray(stepPayload.trackedLinks)
      ? stepPayload.trackedLinks
      : [],
    /* Pergunta do passo, criada ao criar a cadeia e partilhada por todos. */
    questionId: stepPayload.questionId || null,
    scheduledBroadcastId: null,
    sendGroupId: `${chain.id}-step-${stepIndex}`,
    createdByUserId: chain.created_by_user_id || null,
    chainMetadata: {
      messageChainId: chain.id,
      messageChainStepId: chainStep.id,
      messageChainRecipientId: chainRecipient.id,
      messageChainStepIndex: stepIndex,
    },
  });

  const recipientResult = Array.isArray(result?.results)
    ? result.results[0]
    : null;

  if (!recipientResult?.ok) {
    const errorMessage = getResultError(recipientResult);

    await createMessageChainDelivery({
      chainId: chain.id,
      chainStepId: chainStep.id,
      chainRecipientId: chainRecipient.id,
      userId: chainRecipient.user_id,
      messageDbId: null,
      providerMessageId: recipientResult?.providerMessageId || null,
      stepIndex,
      status: "failed",
      sentAt: null,
      failedAt: new Date(),
      errorMessage,
    });

    await markMessageChainDeliveryFailed({
      chainRecipientId: chainRecipient.id,
      stepIndex,
      errorMessage,
    });

    return {
      ok: false,
      sent: false,
      waitingForReply: false,
      kind: recipientResult?.kind || "failed",
      stepIndex,
      error: errorMessage,
      result: recipientResult,
    };
  }

  if (["template", "queued"].includes(recipientResult.kind)) {
    return {
      ok: true,
      sent: false,
      waitingForReply: true,
      kind: recipientResult.kind,
      stepIndex,
      providerMessageId: recipientResult.providerMessageId || null,
      result: recipientResult,
      warning:
        "The chain step is waiting for the opening template's Quick Reply.",
    };
  }

  if (recipientResult.kind !== "freeform") {
    const errorMessage = `Unexpected WhatsApp send result kind: ${
      recipientResult.kind || "unknown"
    }.`;

    await createMessageChainDelivery({
      chainId: chain.id,
      chainStepId: chainStep.id,
      chainRecipientId: chainRecipient.id,
      userId: chainRecipient.user_id,
      messageDbId: null,
      providerMessageId: recipientResult.providerMessageId || null,
      stepIndex,
      status: "failed",
      sentAt: null,
      failedAt: new Date(),
      errorMessage,
    });

    await markMessageChainDeliveryFailed({
      chainRecipientId: chainRecipient.id,
      stepIndex,
      errorMessage,
    });

    return {
      ok: false,
      sent: false,
      waitingForReply: false,
      kind: recipientResult.kind || "unknown",
      stepIndex,
      error: errorMessage,
      result: recipientResult,
    };
  }

  const providerMessageId = recipientResult.providerMessageId || null;

  /* Liga a mensagem à conversa do contacto, quando já existe. */
  const thread = await getLatestUserThreadForChannel(
    chainRecipient.user_id,
    "whatsapp",
  ).catch(() => null);

  const messageRow = await createMessage({
    threadId: thread?.id ?? null,
    userId: chainRecipient.user_id,
    organizationId: chain.organization_id,
    assistantId: thread?.assistant_id ?? null,
    channel: "whatsapp",
    messageId: providerMessageId,
    externalContactId:
      recipientResult.birdContactId ||
      recipientResult.whatsappBsuid ||
      recipientResult.to ||
      null,
    content: getStepContentForMessageRow({
      stepPayload,
      result: recipientResult,
      stepIndex,
    }),
    role: "assistant",
    deliveryStatus: "sent",
    scheduledBroadcastId: null,
    automationRunId: null,
    messageChainId: chain.id,
    messageChainStepId: chainStep.id,
    messageChainRecipientId: chainRecipient.id,
    messageChainStepIndex: stepIndex,
    questionId: stepPayload.questionId || null,
  });

  await createMessageChainDelivery({
    chainId: chain.id,
    chainStepId: chainStep.id,
    chainRecipientId: chainRecipient.id,
    userId: chainRecipient.user_id,
    messageDbId: messageRow.id,
    providerMessageId,
    stepIndex,
    status: "sent",
    sentAt: new Date(),
    errorMessage: providerMessageId
      ? null
      : "Message was sent, but no provider message id was returned. Read tracking may not advance.",
  });

  await updateMessageChainRecipientProgress({
    chainId: chain.id,
    chainRecipientId: chainRecipient.id,
    userId: chainRecipient.user_id,
    currentStepIndex: stepIndex,
    status: "active",
  });

  return {
    ok: true,
    sent: true,
    waitingForReply: false,
    kind: "freeform",
    stepIndex,
    message: messageRow,
    result: recipientResult,
    warning: providerMessageId
      ? null
      : "No provider message id was returned. Read tracking may not advance.",
  };
}
