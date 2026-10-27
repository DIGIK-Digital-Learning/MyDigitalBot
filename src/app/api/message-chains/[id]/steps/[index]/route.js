import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { removeChainStep } from "@/lib/services/broadcast/readChains/openChains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Tira uma mensagem de uma corrente agendada ou a decorrer (?orgId=). */
export async function DELETE(req, { params }) {
  try {
    const { id, index } = await params;
    const stepIndex = Number(index);

    if (!Number.isInteger(stepIndex) || stepIndex < 1) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const orgAuth = await requireOwnedOrg(searchParams.get("orgId"));
    if (orgAuth.error) return orgAuth.error;

    const result = await removeChainStep(orgAuth.orgId, id, stepIndex);
    if (result.code) {
      return NextResponse.json(
        { error: "Could not remove the message", code: result.code },
        { status: result.status },
      );
    }

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.BROADCAST_READ_CHAIN_STEP_REMOVED,
      entityType: "message_chain",
      entityId: id,
      details: {
        channel: result.chain.channel,
        stepIndex,
        stepCount: result.stepCount,
      },
    });

    return NextResponse.json({ ok: true, stepCount: result.stepCount });
  } catch (err) {
    return handleApiError(err, "Failed to remove the chain message");
  }
}
