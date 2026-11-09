import { NextResponse } from "next/server";

import { handleApiError, parsePositiveInt } from "@/lib/auth/guards";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { setOrganizationPlanEnd } from "@/lib/services/plans/platformAdmin.service";

/* Escolhe o dia em que a Demo de uma organização termina (`endsOn`: "2026-11-04"). */
export async function PATCH(req, { params }) {
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
    const result = await setOrganizationPlanEnd({
      orgId,
      endsOn: body?.endsOn,
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
    return handleApiError(err, "Failed to change plan end");
  }
}
