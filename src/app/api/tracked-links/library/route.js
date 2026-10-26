import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { listReusableTrackedLinks } from "@/lib/services/broadcast/trackedLinks";
import { deleteSavedTrackedLink } from "@/lib/repos/trackedLinkSaved.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Links rastreados já usados pela organização, para reutilizar no composer. */
export async function GET(request) {
  try {
    const rawOrgId = request.nextUrl.searchParams.get("orgId");
    if (!rawOrgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgId = parsePositiveInt(rawOrgId);
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const items = await listReusableTrackedLinks(orgAuth.orgId);
      return NextResponse.json({ items });
    });
  } catch (error) {
    return handleApiError(error, "Failed to load tracked links");
  }
}

/*
 * Elimina um link da biblioteca (#189): deixa de aparecer e de contar para os
 * 100 do plano. Os links já enviados continuam a funcionar e os cliques ficam
 * nas Métricas. Não se elimina um link que ainda vai sair numa agendada à
 * espera ou numa corrente a decorrer.
 */
export async function DELETE(request) {
  try {
    const params = request.nextUrl.searchParams;
    const orgId = parsePositiveInt(params.get("orgId"));
    const id = params.get("id") || "";

    if (!orgId || !UUID.test(id)) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const result = await deleteSavedTrackedLink(orgAuth.orgId, id);

    if (!result.ok && result.reason === "not_found") {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "Tracked link is still in use",
          code: "TRACKED_LINK_IN_USE",
          reason: result.reason,
        },
        { status: 409 },
      );
    }

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.TRACKED_LINK_DELETED,
      entityType: "tracked_link",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete tracked link");
  }
}
