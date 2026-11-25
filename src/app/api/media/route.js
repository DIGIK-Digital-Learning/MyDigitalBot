import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import {
  deleteBroadcastMedia,
  listBroadcastMedia,
} from "@/lib/services/media/broadcastMedia.service";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

/* Ficheiros que a organização carregou para as mensagens. */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgAuth = await requireOwnedOrg(searchParams.get("orgId"));
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      // O Storage mantém acesso privilegiado: as policies atuais não permitem
      // listar todas estas pastas com a sessão. O serviço valida o prefixo da org.
      const result = await listBroadcastMedia(orgAuth.admin, orgAuth.orgId);

      return NextResponse.json(result);
    });
  } catch (error) {
    return handleApiError(error, "Failed to load media");
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const orgAuth = await requireOwnedOrg(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    const { name } = await deleteBroadcastMedia(orgAuth.admin, orgAuth.orgId, {
      bucket: body?.bucket,
      path: body?.path,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.MEDIA_DELETED,
      entityId: body.path,
      entityLabel: name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete media");
  }
}
