import {
  getDueAutomationRuns,
  markAutomationRunFailed,
  markAutomationRunMaterialized,
} from "@/lib/repos/automationRuns.repo";
import { createScheduledBroadcast } from "@/lib/repos/scheduledBroadcasts.repo";
import { getUserById } from "@/lib/repos/user.repo";
import { getExpiredOrganizationIds } from "@/lib/services/plans/planLimits";

async function materializeOne(run) {
  try {
    console.log("[materializeOne] start", {
      runId: run.id,
      userId: run.user_id,
      channel: run.channel,
      scheduledFor: run.scheduled_for,
    });

    const user = await getUserById(run.user_id);

    console.log("[materializeOne] user", {
      found: Boolean(user),
      userId: user?.id,
      phone: user?.phone_number,
      assistantId: user?.assistant_id,
    });

    if (!user) {
      await markAutomationRunFailed(
        run.id,
        "User not found while materializing automation run",
      );
      return {
        id: run.id,
        ok: false,
        error: "User not found",
      };
    }

    if (Number(user.organization_id) !== Number(run.organization_id)) {
      await markAutomationRunFailed(
        run.id,
        "User does not belong to automation run organization",
      );
      return {
        id: run.id,
        ok: false,
        error: "User does not belong to automation run organization",
      };
    }

    const payload = {
      ...(run.payload || {}),
      orgId: run.organization_id,
      automationRunId: run.id,
    };

    if (run.channel === "whatsapp") {
      const recipient = { userId: user.id };

      console.log("[materializeOne] whatsapp recipient", {
        recipient,
      });

      if (!recipient) {
        await markAutomationRunFailed(
          run.id,
          "User has no WhatsApp destination",
        );
        return {
          id: run.id,
          ok: false,
          error: "User has no WhatsApp destination",
        };
      }

      payload.recipients = [recipient];
    } else if (run.channel === "teams") {
      payload.userIds = [user.id];
    } else {
      await markAutomationRunFailed(
        run.id,
        `Unsupported channel: ${run.channel}`,
      );
      return {
        id: run.id,
        ok: false,
        error: `Unsupported channel: ${run.channel}`,
      };
    }

    console.log("[materializeOne] creating scheduled_broadcast", {
      organization_id: run.organization_id,
      channel: run.channel,
      scheduled_for: run.scheduled_for,
      recipient_count: 1,
      payload,
    });

    const broadcast = await createScheduledBroadcast({
      organization_id: run.organization_id,
      channel: run.channel,
      status: "queued",
      scheduled_for: run.scheduled_for,
      recipient_count: 1,
      payload,
    });

    console.log("[materializeOne] scheduled_broadcast created", {
      broadcastId: broadcast?.id,
    });

    await markAutomationRunMaterialized(run.id, broadcast.id);

    console.log("[materializeOne] automation_run marked materialized", {
      runId: run.id,
      broadcastId: broadcast.id,
    });

    return {
      id: run.id,
      ok: true,
      scheduledBroadcastId: broadcast.id,
    };
  } catch (error) {
    console.error("[materializeOne] failed", {
      runId: run.id,
      message: error?.message || String(error),
      error,
    });

    await markAutomationRunFailed(run.id, error?.message || String(error));

    return {
      id: run.id,
      ok: false,
      error: error?.message || String(error),
    };
  }
}

export async function materializeDueRuns({ limit = 200, organizationId = null } = {}) {
  console.log("[materialize] now:", new Date().toISOString());
  /* A Demo terminou (#209): as automações dessas empresas ficam à espera. */
  const dueRuns = await getDueAutomationRuns(limit, {
    organizationId,
    excludeOrganizationIds: await getExpiredOrganizationIds(),
  });
  console.log(
    "[materialize] dueRuns:",
    dueRuns.map((r) => ({
      id: r.id,
      status: r.status,
      scheduled_for: r.scheduled_for,
    })),
  );

  if (!dueRuns.length) {
    return {
      ok: true,
      message: "No automation runs due",
      processed: 0,
      results: [],
    };
  }

  const results = [];

  for (const run of dueRuns) {
    console.log("[materialize] loop run", run.id);
    results.push(await materializeOne(run));
  }

  return {
    ok: true,
    processed: results.length,
    materialized: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
