import { NextResponse } from "next/server";

import { withSessionReadAccess } from "@/lib/db/readAccess";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { getTrackedLinksOverview } from "@/lib/services/broadcast/trackedLinksOverview";

/*
 * A lista de links da página "Links Rastreados": cada link com os totais e
 * os envios em que foi usado, incluindo os eliminados.
 */
export async function GET(req) {
  try {
    const orgId = parsePositiveInt(new URL(req.url).searchParams.get("orgId"));
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const links = await getTrackedLinksOverview(orgAuth.orgId);
      return NextResponse.json({ links });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load tracked links");
  }
}
