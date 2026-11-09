import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { closeChain } from "@/lib/services/broadcast/readChains/openChains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Cancela uma corrente agendada (devolve os envios se for no dia em que foi
 * criada) ou para uma corrente a decorrer.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const orgAuth = await requireOwnedOrg(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    const result = await closeChain(orgAuth.orgId, id);
    if (result.code) {
      return NextResponse.json(
        { error: "Could not close message chain", code: result.code },
        { status: result.status },
      );
    }

    await recordAuditEvent(orgAuth, {
      action:
        result.action === "cancelled"
          ? AUDIT_ACTIONS.BROADCAST_READ_CHAIN_CANCELLED
          : AUDIT_ACTIONS.BROADCAST_READ_CHAIN_STOPPED,
      entityType: "message_chain",
      entityId: id,
      details: {
        channel: result.chain.channel,
        recipientCount: result.chain.recipient_count,
        scheduledFor: result.chain.scheduled_for || null,
      },
    });

    return NextResponse.json({ ok: true, action: result.action });
  } catch (err) {
    return handleApiError(err, "Failed to close message chain");
  }
}
