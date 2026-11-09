import { NextResponse } from "next/server";

import { handleApiError, parsePositiveInt } from "@/lib/auth/guards";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { extendOrganizationPlan } from "@/lib/services/plans/platformAdmin.service";

/* Prolonga a Demo de uma organização (por omissão, mais 7 dias). */
export async function POST(req, { params }) {
  try {
    const auth = await requirePlatformAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const orgId = parsePositiveInt(id);
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization" },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const result = await extendOrganizationPlan({
      orgId,
      days: body?.days === undefined ? 7 : Number(body.days),
      adminOrgId: auth.orgId,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "ORG_NOT_FOUND" ? 404 : 400 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "Failed to extend plan");
  }
}
