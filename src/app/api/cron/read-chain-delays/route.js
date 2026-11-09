export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  claimDueScheduledMessageChainDeliveries,
  createMessageChainDelivery,
  getMessageChainById,
  getMessageChainRecipientById,
  getMessageChainStep,
} from "@/lib/repos/messageChain.repo";
import { sendReadChainStep } from "@/lib/services/broadcast/readChains/sendReadChainStep";
import { getExpiredOrganizationIds } from "@/lib/services/plans/planLimits";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;

  const cronSecret = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization") || "";

  return cronSecret === secret || auth === `Bearer ${secret}`;
}

async function markDeliverySkipped({ delivery, reason }) {
  return createMessageChainDelivery({
    chainId: delivery.chain_id,
    chainStepId: delivery.chain_step_id,
    chainRecipientId: delivery.chain_recipient_id,
    userId: delivery.user_id,
    messageDbId: delivery.message_id || null,
    providerMessageId: delivery.provider_message_id || null,
    stepIndex: delivery.step_index,
    status: "skipped",
    sentAt: null,
    readAt: null,
    failedAt: null,
    dueAt: null,
    errorMessage: reason,
  });
}

async function markDeliveryFailed({ delivery, errorMessage }) {
  return createMessageChainDelivery({
    chainId: delivery.chain_id,
    chainStepId: delivery.chain_step_id,
    chainRecipientId: delivery.chain_recipient_id,
    userId: delivery.user_id,
    messageDbId: delivery.message_id || null,
    providerMessageId: delivery.provider_message_id || null,
    stepIndex: delivery.step_index,
    status: "failed",
    sentAt: null,
    readAt: null,
    failedAt: new Date(),
    dueAt: null,
    errorMessage,
  });
}

async function processDueDelayedSteps(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 50;

  /* A Demo terminou (#209): os passos dessas empresas ficam à espera. */
  const deliveries = await claimDueScheduledMessageChainDeliveries({
    limit,
    excludeOrganizationIds: await getExpiredOrganizationIds(),
  });

  const results = [];

  for (const delivery of deliveries) {
    const result = {
      deliveryId: delivery.id,
      chainId: delivery.chain_id,
      chainRecipientId: delivery.chain_recipient_id,
      userId: delivery.user_id,
      stepIndex: delivery.step_index,
      ok: false,
      sent: false,
      waitingForReply: false,
      skipped: false,
      kind: null,
      error: null,
    };

    try {
      const chain = await getMessageChainById(delivery.chain_id);

      if (!chain || chain.status !== "active") {
        const reason = "Chain is not active.";

        await markDeliverySkipped({ delivery, reason });

        results.push({
          ...result,
          ok: true,
          skipped: true,
          kind: "skipped",
          error: reason,
        });

        continue;
      }

      const chainRecipient = await getMessageChainRecipientById(
        delivery.chain_recipient_id,
      );

      if (!chainRecipient || chainRecipient.status !== "active") {
        const reason = "Chain recipient is not active.";

        await markDeliverySkipped({ delivery, reason });

        results.push({
          ...result,
          ok: true,
          skipped: true,
          kind: "skipped",
          error: reason,
        });

        continue;
      }

      if (Number(chainRecipient.chain_id) !== Number(chain.id)) {
        throw new Error("Chain recipient does not belong to chain.");
      }

      if (Number(chainRecipient.user_id) !== Number(delivery.user_id)) {
        throw new Error("Chain recipient does not belong to delivery user.");
      }

      const chainStep = await getMessageChainStep({
        chainId: delivery.chain_id,
        stepIndex: delivery.step_index,
      });

      if (!chainStep) {
        throw new Error("Could not find delayed chain step");
      }

      if (String(chainStep.chain_id) !== String(chain.id)) {
        throw new Error("Chain step does not belong to chain.");
      }

      if (String(chainStep.id) !== String(delivery.chain_step_id)) {
        throw new Error("Chain step does not belong to delivery.");
      }

      const sendResult = await sendReadChainStep({
        chain,
        chainRecipient,
        chainStep,
        stepIndex: delivery.step_index,
      });

      results.push({
        ...result,
        ok: Boolean(sendResult.ok),
        sent: Boolean(sendResult.sent),
        waitingForReply: Boolean(sendResult.waitingForReply),
        kind: sendResult.kind || null,
        error: sendResult.error || null,
      });
    } catch (error) {
      console.error("[cron/read-chain-delays] delivery failed:", {
        deliveryId: delivery.id,
        error,
      });

      await markDeliveryFailed({
        delivery,
        errorMessage: error.message || "Delayed read chain step failed.",
      });

      results.push({
        ...result,
        ok: false,
        sent: false,
        kind: "error",
        error: error.message || "Delayed read chain step failed.",
      });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  const waitingForReply = results.filter((r) => r.waitingForReply).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    claimed: deliveries.length,
    sent,
    waitingForReply,
    skipped,
    failed,
    results,
  });
}

export async function POST(req) {
  try {
    return await processDueDelayedSteps(req);
  } catch (error) {
    console.error("[cron/read-chain-delays] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error.message || "Failed to process delayed read chain messages.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  return POST(req);
}
