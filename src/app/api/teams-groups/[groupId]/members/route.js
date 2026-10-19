import { withSessionReadAccess, getSessionReadClient } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  jsonError,
  requireOrgForTeamsGroup,
} from "@/lib/auth/guards";
import { getTeamsGroupMembers } from "@/lib/services/teams/teamsGroups.service";

/*
 * Membros do grupo, lidos no Teams na hora (#165). Só funciona enquanto o
 * bot estiver no grupo.
 */
export async function GET(_req, { params }) {
  try {
    const { groupId } = await params;

    const orgAuth = await requireOrgForTeamsGroup(groupId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      if (orgAuth.group.is_active === false) {
        return jsonError("The bot is no longer in this group", 409);
      }

      try {
        const items = await getTeamsGroupMembers(
          getSessionReadClient(orgAuth),
          orgAuth.orgId,
          orgAuth.group,
        );

        return NextResponse.json({ items });
      } catch (error) {
        console.error("[Teams groups] members request failed", error?.message);

        return jsonError("Could not read the group members from Teams", 502);
      }
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Teams group members");
  }
}
