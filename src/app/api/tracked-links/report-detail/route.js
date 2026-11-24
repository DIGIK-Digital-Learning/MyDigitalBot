import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getTrackedLinkReportDetail } from "@/lib/repos/trackedLinks.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));
    const sendGroupId = String(searchParams.get("sendGroupId") || "").trim();

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.LINKS_VIEW });
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      if (!sendGroupId) {
        return NextResponse.json(
          { error: "Missing required params" },
          { status: 400 },
        );
      }

      const result = await getTrackedLinkReportDetail({
        orgId: orgAuth.orgId,
        sendGroupId,
      });

      return NextResponse.json(result);
    });
  } catch (err) {
    return handleApiError(err, "Failed to load tracked-link report detail");
  }
}
