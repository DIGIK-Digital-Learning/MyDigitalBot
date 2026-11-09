import { withSessionReadAccess, getSessionReadClient } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { listTeamsGroups } from "@/lib/services/teams/teamsGroups.service";

/* Grupos do Teams onde o bot está ou esteve instalado (#165). */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgAuth = await requireOwnedOrg(searchParams.get("orgId"));
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const items = await listTeamsGroups(getSessionReadClient(orgAuth), orgAuth.orgId);

      return NextResponse.json({ items });
    });
  } catch (error) {
    return handleApiError(error, "Failed to load Teams groups");
  }
}
