import { NextResponse } from "next/server";

import {
  requireOwnedOrg,
  assertUsersBelongToOrg,
  jsonError,
} from "@/lib/auth/guards";

import { sendTeamsBroadcast } from "@/lib/services/broadcast/sendTeamsBroadcast";
import {
  checkMessageContent,
  claimDailySend,
  releaseDailySend,
} from "@/lib/services/plans/planLimits";

import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

/*
 * The composer sends `userIds` (same as the Teams
 * schedule payload); `recipients` is still accepted.
 */
function getRecipientUserIds(body = {}) {
  const raw = Array.isArray(body?.userIds)
    ? body.userIds
    : (Array.isArray(body?.recipients) ? body.recipients : []).map(
        (recipient) => recipient?.userId ?? recipient?.id,
      );

  return raw
    .map(Number)
    .filter((userId) => Number.isInteger(userId) && userId > 0);
}

export async function POST(req) {
  try {
    const body = await req.json();

    /*
     * =========================================================
     * AUTHORIZE ORGANIZATION
     * =========================================================
     */
    const orgAuth = await requireOwnedOrg(body?.orgId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    /*
     * =========================================================
     * VALIDATE RECIPIENTS
     * =========================================================
     */
    const userIds = getRecipientUserIds(body);

    if (!userIds.length) {
      return jsonError("No valid recipients selected", 400);
    }

    /*
     * Make sure every selected recipient actually
     * belongs to the authenticated organization.
     */
    await assertUsersBelongToOrg(orgAuth.admin, orgAuth.orgId, userIds);

    /* Conteúdo da mensagem dentro do plano (#187): caracteres e ficheiros. */
    const content = await checkMessageContent(orgAuth.orgId, {
      message: typeof body?.message === "string" ? body.message : "",
      files: Array.isArray(body?.files) ? body.files : [],
    });
    if (content.body) {
      return NextResponse.json(content.body, { status: 400 });
    }

    /*
     * =========================================================
     * SEND TEAMS BROADCAST
     * =========================================================
     */
    /*
     * Limite diário de envios do canal (#188): este envio conta 1, seja para
     * quantos colaboradores for. Reserva-se antes de enviar; se não chegar a
     * ninguém, devolve-se.
     */
    const daily = await claimDailySend(orgAuth.orgId, "teams", {
      orgLimits: content.orgLimits,
    });
    if (daily.body) {
      return NextResponse.json(daily.body, { status: 409 });
    }

    let result;
    try {
      result = await sendTeamsBroadcast({
        orgId: orgAuth.orgId,

        userIds,

        message: typeof body?.message === "string" ? body.message : "",

        files: Array.isArray(body?.files) ? body.files : [],

        imageUrls: Array.isArray(body?.imageUrls) ? body.imageUrls : [],

        trackedLinks: Array.isArray(body?.trackedLinks)
          ? body.trackedLinks
          : [],

        /* Quiz, survey or open question (#151), validated by the service. */
        question: body?.question ?? null,

        /*
         * This is an immediate broadcast.
         *
         * Scheduled broadcasts can provide these
         * values from their own execution path.
         */
        scheduledBroadcastId: null,

        createdByUserId: null,
      });
    } catch (err) {
      await releaseDailySend(daily.claimKey);
      throw err;
    }

    if (!result?.ok) await releaseDailySend(daily.claimKey);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.BROADCAST_SENT,
      entityId: result?.sendGroupId,
      details: {
        channel: "teams",
        recipientCount: userIds.length,
        ok: result?.ok ?? 0,
        failed: result?.failed ?? 0,
      },
    });

    return NextResponse.json(result, {
      status: 200,
    });
  } catch (error) {
    console.error("[Teams Broadcast] failed", error);

    return jsonError(
      error?.message || "Failed to send Teams broadcast",
      error?.status || 500,
    );
  }
}
