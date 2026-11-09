export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  claimDueScheduledMessageChains,
  getMessageChainDelivery,
  getMessageChainRecipientsByChainId,
  getMessageChainStep,
  markMessageChainActive,
  markMessageChainFailed,
} from "@/lib/repos/messageChain.repo";

import { sendReadChainStep } from "@/lib/services/broadcast/readChains/sendReadChainStep";
import { refundChainSend } from "@/lib/repos/adminDailySends.repo";
import { dailySendsDayStart } from "@/lib/plans/dailySends";
import { getExpiredOrganizationIds } from "@/lib/services/plans/planLimits";

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;

  const cronSecret = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization") || "";

  return cronSecret === secret || auth === `Bearer ${secret}`;
}

/*
 * A corrente falhou logo na 1.ª mensagem e já não continua: nenhuma mensagem
 * dela conta como envio (#188). Se foi criada hoje, os envios voltam ao
 * limite do dia; criada noutro dia, já não.
 */
async function refundFailedChain(chainId) {
  try {
    await refundChainSend(chainId, dailySendsDayStart());
  } catch (error) {
    console.warn("[cron/read-chains] Failed to refund daily sends", {
      chainId,
      message: error?.message || String(error),
    });
  }
}

async function processDueReadChains(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") || 25);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 25;

  /* A Demo terminou (#209): as correntes dessas empresas ficam à espera. */
  const chains = await claimDueScheduledMessageChains({
    limit,
    excludeOrganizationIds: await getExpiredOrganizationIds(),
  });

  const chainResults = [];

  for (const chain of chains) {
    const result = {
      chainId: chain.id,
      scheduledFor: chain.scheduled_for,
      ok: 0,
      failed: 0,
      skipped: 0,
      waitingForReply: 0,
      results: [],
      error: null,
    };

    try {
      const firstStep = await getMessageChainStep({
        chainId: chain.id,
        stepIndex: 1,
      });

      if (!firstStep) {
        throw new Error("Could not find step 1 for scheduled read chain.");
      }

      if (String(firstStep.chain_id) !== String(chain.id)) {
        throw new Error("Chain step does not belong to chain.");
      }

      const recipients = await getMessageChainRecipientsByChainId(chain.id);

      if (!recipients.length) {
        throw new Error("Scheduled read chain has no recipients");
      }

      for (const chainRecipient of recipients) {
        try {
          if (String(chainRecipient.chain_id) !== String(chain.id)) {
            throw new Error("Chain recipient does not belong to chain.");
          }

          if (chainRecipient.status !== "active") {
            result.skipped += 1;

            result.results.push({
              userId: chainRecipient.user_id,
              ok: true,
              skipped: true,
              reason: "Chain recipient is not active.",
            });

            continue;
          }

          const existingDelivery = await getMessageChainDelivery({
            chainRecipientId: chainRecipient.id,
            stepIndex: 1,
          });

          if (existingDelivery) {
            result.skipped += 1;

            result.results.push({
              userId: chainRecipient.user_id,
              ok: true,
              skipped: true,
              reason: "Step 1 delivery already exists.",
            });

            continue;
          }

          const sendResult = await sendReadChainStep({
            chain,
            chainRecipient,
            chainStep: firstStep,
            stepIndex: 1,
          });

          if (sendResult.ok) {
            result.ok += 1;
          } else {
            result.failed += 1;
          }

          if (sendResult.waitingForReply) {
            result.waitingForReply += 1;
          }

          result.results.push({
            userId: chainRecipient.user_id,
            ok: Boolean(sendResult.ok),
            sent: Boolean(sendResult.sent),
            waitingForReply: Boolean(sendResult.waitingForReply),
            kind: sendResult.kind || null,
            error: sendResult.error || null,
            warning: sendResult.warning || null,
          });
        } catch (recipientError) {
          result.failed += 1;

          result.results.push({
            userId: chainRecipient.user_id,
            ok: false,
            sent: false,
            waitingForReply: false,
            kind: "error",
            error:
              recipientError.message ||
              "Failed to process scheduled chain recipient.",
          });
        }
      }

      if (result.ok > 0 || result.waitingForReply > 0 || result.skipped > 0) {
        await markMessageChainActive(chain.id);
      } else {
        await markMessageChainFailed({
          chainId: chain.id,
          errorMessage:
            result.results[0]?.error ||
            "Scheduled read chain failed for all recipients",
        });
        await refundFailedChain(chain.id);
      }
    } catch (chainError) {
      result.error =
        chainError.message || "Failed to process scheduled read chain.";

      await markMessageChainFailed({
        chainId: chain.id,
        errorMessage: result.error,
      });
      await refundFailedChain(chain.id);
    }

    chainResults.push(result);
  }

  const started = chainResults.filter(
    (result) =>
      result.ok > 0 || result.waitingForReply > 0 || result.skipped > 0,
  ).length;

  const failed = chainResults.filter(
    (result) => result.error || result.failed > 0,
  ).length;

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    claimed: chains.length,
    started,
    failed,
    results: chainResults,
  });
}

export async function POST(req) {
  try {
    return await processDueReadChains(req);
  } catch (error) {
    console.error("[cron/read-chains] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to process scheduled read chains.",
      },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  return POST(req);
}
