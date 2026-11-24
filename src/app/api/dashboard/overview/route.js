import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDashboardOverview } from "@/lib/services/dashboard/dashboard.service";

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

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.DASHBOARD_VIEW });
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const overview = await getDashboardOverview(orgAuth.orgId);
      return NextResponse.json(overview);
    });
  } catch (error) {
    return handleApiError(error, "Failed to load dashboard overview");
  }
}
