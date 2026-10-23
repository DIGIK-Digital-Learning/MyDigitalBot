import { NextResponse } from "next/server";
import { sendWhatsappBroadcast } from "@/lib/services/broadcast/sendWhatsappBroadcast";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  assertUsersBelongToOrg,
  handleApiError,
  requireAllRecipientsToBeKnownUsers,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { parseOpeningOptions } from "@/lib/services/broadcast/openingOptions";
import { parseQuestionOptions } from "@/lib/services/broadcast/questionOptions";
import { checkMessageContent } from "@/lib/services/plans/planLimits";

export async function POST(req) {
  try {
    const body = await req.json();

    const orgAuth = await requireOwnedOrg(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    const recipientUserIds = requireAllRecipientsToBeKnownUsers(
      body?.recipients,
    );
    await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      recipientUserIds,
    );

    const opening = parseOpeningOptions(body);

    if (opening.error) {
      return NextResponse.json({ error: opening.error }, { status: 400 });
    }

    const question = parseQuestionOptions(body);

    if (question.error) {
      return NextResponse.json({ error: question.error }, { status: 400 });
    }

    /*
     * Conteúdo da mensagem dentro do plano (#187): caracteres e ficheiros.
     * Os imageUrls são as mesmas imagens que já vão em files, por isso só se
     * contam os files.
     */
    const content = await checkMessageContent(orgAuth.orgId, {
      message: body?.message || "",
      files: Array.isArray(body?.files) ? body.files : [],
    });
    if (content.body) {
      return NextResponse.json(content.body, { status: 400 });
    }

    const result = await sendWhatsappBroadcast({
      orgId: orgAuth.orgId,
      message: body?.message || "",
      files: Array.isArray(body?.files) ? body.files : [],
      imageUrls: Array.isArray(body?.imageUrls) ? body.imageUrls : [],
      trackedLinks: Array.isArray(body?.trackedLinks) ? body.trackedLinks : [],
      recipients: recipientUserIds.map((userId) => ({ userId })),
      openingBody: opening.openingBody,
      openingOnly: opening.openingOnly,
      scheduledBroadcastId: null,
      createdByUserId: null,
      chainMetadata: null,
      question: question.question,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.BROADCAST_SENT,
      entityId: result?.sendGroupId,
      details: {
        channel: "whatsapp",
        recipientCount: recipientUserIds.length,
        ok: result?.ok ?? 0,
        failed: result?.failed ?? 0,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "WhatsApp broadcast failed");
  }
}
