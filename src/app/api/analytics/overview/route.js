import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAnalyticsOverview } from "@/lib/services/analytics/analytics.service";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgId = Number(searchParams.get("orgId"));
    const period = searchParams.get("period") || "all";

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const data = await getAnalyticsOverview({
        orgId: orgAuth.orgId,
        period,
      });

      return NextResponse.json(data);
    });
  } catch (err) {
    return handleApiError(err, "Failed to load analytics overview");
  }
}
