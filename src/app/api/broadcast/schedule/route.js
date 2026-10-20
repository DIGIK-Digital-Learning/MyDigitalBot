import { NextResponse } from "next/server";
import { createScheduledBroadcast } from "@/lib/repos/scheduledBroadcasts.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { buildScheduledPayload } from "@/lib/services/broadcast/scheduledPayload";

export async function POST(req) {
  try {
    const body = await req.json();

    const { orgId, channel, scheduledFor, timezone, payload } = body;

    if (!orgId || !channel || !scheduledFor || !payload) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    if (!["teams", "whatsapp"].includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { error: "Invalid scheduledFor date" },
        { status: 400 },
      );
    }

    if (when.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Scheduled date must be in the future" },
        { status: 400 },
      );
    }

    const built = await buildScheduledPayload({
      orgAuth,
      channel,
      payload,
    });

    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const row = await createScheduledBroadcast({
      organization_id: orgAuth.orgId,
      created_by_user_id: orgAuth.user.id,
      channel,
      status: "queued",
      scheduled_for: when.toISOString(),
      timezone: timezone || null,
      payload: built.payload,
      recipient_count: built.recipientCount,
    });

    const isGroupBroadcast = Array.isArray(built.payload.groupIds);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.BROADCAST_SCHEDULED,
      entityType: "scheduled_broadcast",
      entityId: row?.id,
      details: {
        channel,
        ...(isGroupBroadcast
          ? { groupCount: built.recipientCount }
          : { recipientCount: built.recipientCount }),
        scheduledFor: when.toISOString(),
        timezone: timezone || null,
      },
    });

    return NextResponse.json({ ok: true, item: row });
  } catch (err) {
    return handleApiError(err, "Failed to schedule broadcast");
  }
}
