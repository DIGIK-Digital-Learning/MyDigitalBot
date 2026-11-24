import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getTrackedLinkReportsByOrg } from "@/lib/repos/trackedLinks.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.LINKS_VIEW });
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const items = await getTrackedLinkReportsByOrg(orgAuth.orgId);
      return NextResponse.json({ items });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load tracked-link reports");
  }
}