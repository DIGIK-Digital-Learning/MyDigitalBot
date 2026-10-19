import { withSessionReadAccess, getSessionReadClient } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { handleApiError, requireOrgForTeamsGroup } from "@/lib/auth/guards";
import {
  getTeamsGroupDetail,
  updateTeamsGroupSettings,
} from "@/lib/services/teams/teamsGroups.service";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

/* Um grupo com as mensagens trocadas nele (#165). */
export async function GET(_req, { params }) {
  try {
    const { groupId } = await params;

    const orgAuth = await requireOrgForTeamsGroup(groupId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const detail = await getTeamsGroupDetail(
        getSessionReadClient(orgAuth),
        orgAuth.orgId,
        orgAuth.group,
      );

      return NextResponse.json(detail);
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Teams group");
  }
}

/* Nome e assistente que responde no grupo. */
export async function PATCH(req, { params }) {
  try {
    const { groupId } = await params;

    const orgAuth = await requireOrgForTeamsGroup(groupId);
    if (orgAuth.error) return orgAuth.error;

    const body = await req.json().catch(() => ({}));

    const { updated, fields } = await updateTeamsGroupSettings(
      orgAuth.admin,
      orgAuth.orgId,
      orgAuth.group,
      { name: body?.name, assistantId: body?.assistantId },
    );

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.TEAMS_GROUP_UPDATED,
      entityId: updated.id,
      entityLabel: updated.name || orgAuth.group.name,
      details: { fields },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to update Teams group");
  }
}
