import { NextResponse } from "next/server";
import {
  getDueScheduledBroadcasts,
  markScheduledBroadcastProcessing,
  finishScheduledBroadcast,
} from "@/lib/repos/scheduledBroadcasts.repo";
import {
  getAutomationRunForScheduledBroadcast,
  markAutomationRunFailed,
  markAutomationRunProcessing,
  markAutomationRunSent,
} from "@/lib/repos/automationRuns.repo";
import { sendTeamsBroadcast } from "@/lib/services/broadcast/sendTeamsBroadcast";
import { sendTeamsGroupBroadcast } from "@/lib/services/broadcast/sendTeamsGroupBroadcast";
import { sendWhatsappBroadcast } from "@/lib/services/broadcast/sendWhatsappBroadcast";
import { recordSystemAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { summarizeBroadcastPayload } from "@/lib/logging/summarizeBroadcastPayload";
import { refundScheduledSend } from "@/lib/repos/adminDailySends.repo";
import { dailySendsDayStart } from "@/lib/plans/dailySends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const xCronSecret = req.headers.get("x-cron-secret") || "";

  return bearer === cronSecret || xCronSecret === cronSecret;
}

async function syncAutomationRunProcessing(automationRunId, context) {
  if (!automationRunId) return;

  try {
    await markAutomationRunProcessing(automationRunId, context);
  } catch (error) {
    console.warn("[Automations] Failed to mark run processing", {
      automationRunId,
      message: error?.message || String(error),
    });
  }
}

async function syncAutomationRunSuccess(automationRunId, context) {
  if (!automationRunId) return;

  try {
    await markAutomationRunSent(automationRunId, context);
  } catch (error) {
    console.warn("[Automations] Failed to mark run sent", {
      automationRunId,
      message: error?.message || String(error),
    });
  }
}

async function syncAutomationRunFailure(
  automationRunId,
  errorMessage,
  context,
) {
  if (!automationRunId) return;

  try {
    await markAutomationRunFailed(automationRunId, errorMessage, context);
  } catch (error) {
    console.warn("[Automations] Failed to mark run failed", {
      automationRunId,
      message: error?.message || String(error),
    });
  }
}

function auditScheduledSend(broadcast, details) {
  return recordSystemAuditEvent(broadcast.organization_id, {
    action: AUDIT_ACTIONS.BROADCAST_SCHEDULED_SENT,
    entityType: "scheduled_broadcast",
    entityId: broadcast.id,
    details: {
      channel: broadcast.channel,
      recipientCount: broadcast.recipient_count ?? null,
      automation: Boolean(broadcast?.payload?.automationRunId),
      ...details,
    },
  });
}

/*
 * Uma agendada que falhou para toda a gente não conta como envio (#188): se
 * foi agendada hoje, volta ao limite do dia. Agendada noutro dia, já não.
 */
async function refundFailedSend(broadcast) {
  try {
    await refundScheduledSend(broadcast.id, dailySendsDayStart());
  } catch (error) {
    console.warn("[Schedule Broadcast] Failed to refund daily send", {
      broadcastId: broadcast.id,
      message: error?.message || String(error),
    });
  }
}

function normalizeError(err) {
  if (!err) return "Unknown error";

  if (typeof err === "string") return err;
  if (typeof err?.message === "string" && err.message !== "[object Object]") {
    return err.message;
  }
  if (typeof err?.error === "string") return err.error;
  if (typeof err?.data?.error === "string") return err.data.error;

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function processOneBroadcast(broadcast) {
  let locked;
  const automationRunId = broadcast?.payload?.automationRunId || null;
  let verifiedAutomationRunId = null;
  const automationContext = {
    organizationId: broadcast.organization_id,
    scheduledBroadcastId: broadcast.id,
  };

  try {
    locked = await markScheduledBroadcastProcessing(broadcast.id);
  } catch (err) {
    return {
      id: broadcast.id,
      ok: false,
      skipped: true,
      error: normalizeError(err),
    };
  }

  if (!locked) {
    return {
      id: broadcast.id,
      ok: false,
      skipped: true,
      error: "Could not lock broadcast for processing",
    };
  }

  try {
    if (automationRunId) {
      const automationRun = await getAutomationRunForScheduledBroadcast({
        id: automationRunId,
        ...automationContext,
      });

      if (!automationRun) {
        throw new Error(
          "Automation run does not belong to this scheduled broadcast",
        );
      }

      verifiedAutomationRunId = automationRun.id;
      await syncAutomationRunProcessing(
        verifiedAutomationRunId,
        automationContext,
      );
    }

    const storedPayload = broadcast.payload || {};
    const payload = {
      orgId: broadcast.organization_id,
      message: storedPayload.message || "",
      files: Array.isArray(storedPayload.files) ? storedPayload.files : [],
      imageUrls: Array.isArray(storedPayload.imageUrls)
        ? storedPayload.imageUrls
        : [],
      trackedLinks: Array.isArray(storedPayload.trackedLinks)
        ? storedPayload.trackedLinks
        : [],
      scheduledBroadcastId: broadcast.id,
      createdByUserId: null,
      ...(broadcast.channel === "whatsapp"
        ? {
            recipients: Array.isArray(storedPayload.recipients)
              ? storedPayload.recipients
              : [],
            openingBody: storedPayload.openingBody || null,
            openingOnly: storedPayload.openingOnly === true,
            chainMetadata: null,
            question: storedPayload.question || null,
          }
        : {
            userIds: Array.isArray(storedPayload.userIds)
              ? storedPayload.userIds
              : [],
            automationRunId: verifiedAutomationRunId,
            question: storedPayload.question || null,
          }),
    };

    console.log("[Schedule Broadcast] payload before send", {
      broadcastId: broadcast.id,
      channel: broadcast.channel,
      summary: summarizeBroadcastPayload(payload),
    });

    let result;

    const groupIds = Array.isArray(storedPayload.groupIds)
      ? storedPayload.groupIds
      : [];

    if (broadcast.channel === "whatsapp") {
      result = await sendWhatsappBroadcast(payload);
    } else if (broadcast.channel === "teams" && groupIds.length) {
      /* Grupos do Teams (#166): o serviço relê os grupos da organização. */
      result = await sendTeamsGroupBroadcast({
        orgId: broadcast.organization_id,
        groupIds,
        message: payload.message,
        files: payload.files,
        imageUrls: payload.imageUrls,
        scheduledBroadcastId: broadcast.id,
      });
    } else if (broadcast.channel === "teams") {
      result = await sendTeamsBroadcast(payload);
    } else {
      throw new Error(`Unsupported channel: ${broadcast.channel}`);
    }

    const okCount = Number(result?.ok || 0);
    const failedCount = Number(result?.failed || 0);

    let finalStatus = "sent";
    if (okCount > 0 && failedCount > 0) finalStatus = "partial";
    if (okCount === 0 && failedCount > 0) finalStatus = "failed";

    await finishScheduledBroadcast(broadcast.id, {
      status: finalStatus,
    });

    await auditScheduledSend(broadcast, {
      ok: okCount,
      failed: failedCount,
      status: finalStatus,
    });

    if (finalStatus === "failed") {
      await refundFailedSend(broadcast);
      await syncAutomationRunFailure(
        verifiedAutomationRunId,
        JSON.stringify(result?.results || result || {}),
        automationContext,
      );
    } else {
      await syncAutomationRunSuccess(
        verifiedAutomationRunId,
        automationContext,
      );
    }

    return {
      id: broadcast.id,
      ok: finalStatus !== "failed",
      status: finalStatus,
      result,
    };
  } catch (err) {
    console.error("[Schedule Broadcast] processOneBroadcast failed", {
      broadcastId: broadcast.id,
      channel: broadcast.channel,
      payload: broadcast.payload,
      err,
      message: err?.message,
      stack: err?.stack,
    });

    try {
      await finishScheduledBroadcast(broadcast.id, { status: "failed" });
    } catch (finishErr) {
      console.error(
        `[Schedule Broadcast] Failed to mark ${broadcast.id} as failed:`,
        finishErr,
      );
    }

    await refundFailedSend(broadcast);

    const normalizedError = normalizeError(err);

    await auditScheduledSend(broadcast, {
      status: "failed",
      error: normalizedError,
    });

    await syncAutomationRunFailure(
      verifiedAutomationRunId,
      normalizedError,
      automationContext,
    );

    return {
      id: broadcast.id,
      ok: false,
      status: "failed",
      error: normalizedError,
    };
  }
}

async function handler(req) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let limit = 500;

    try {
      if (req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        if (body?.limit) limit = Number(body.limit) || 500;
      } else {
        const url = new URL(req.url);
        const rawLimit = url.searchParams.get("limit");
        if (rawLimit) limit = Number(rawLimit) || 500;
      }
    } catch {
      // keep default
    }

    const due = await getDueScheduledBroadcasts(limit);

    if (!due.length) {
      return NextResponse.json({
        ok: true,
        message: "No schedule broadcasts due",
        processed: 0,
        results: [],
      });
    }

    const results = [];
    for (const broadcast of due) {
      const result = await processOneBroadcast(broadcast);
      results.push(result);
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      partial: results.filter((r) => r.status === "partial").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: results.filter((r) => r.skipped).length,
      results,
    });
  } catch (err) {
    console.error("[Schedule Broadcast] Cron error:", err);
    return NextResponse.json(
      { error: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  return handler(req);
}

export async function POST(req) {
  return handler(req);
}
