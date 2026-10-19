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
