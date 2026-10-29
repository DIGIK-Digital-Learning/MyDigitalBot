import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import {
  editChainStep,
  removeChainStep,
} from "@/lib/services/broadcast/readChains/openChains";

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

/* Muda o texto de uma mensagem da corrente (body: { orgId, message }). */
export async function PATCH(req, { params }) {
  try {
    const { id, index } = await params;
    const stepIndex = Number(index);

    if (!Number.isInteger(stepIndex) || stepIndex < 1) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    if (typeof body?.message !== "string") {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(body.orgId);
    if (orgAuth.error) return orgAuth.error;

    const result = await editChainStep(
      orgAuth.orgId,
      id,
      stepIndex,
      body.message,
    );
    if (result.code) {
      return NextResponse.json(
        result.body || {
          error: "Could not edit the message",
          code: result.code,
        },
        { status: result.status },
      );
    }

    if (result.changed) {
      await recordAuditEvent(orgAuth, {
        action: AUDIT_ACTIONS.BROADCAST_READ_CHAIN_STEP_EDITED,
        entityType: "message_chain",
        entityId: id,
        details: { channel: result.chain.channel, stepIndex },
      });
    }

    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (err) {
    return handleApiError(err, "Failed to edit the chain message");
  }
}
