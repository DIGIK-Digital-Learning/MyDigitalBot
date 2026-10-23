import { NextResponse } from "next/server";

import { handleApiError, parsePositiveInt } from "@/lib/auth/guards";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { changeOrganizationPlan } from "@/lib/services/plans/platformAdmin.service";

/*
 * Muda o plano de uma organização (#208). Serve também para os
 * administradores "experimentarem como" outro plano na própria organização.
 */
export async function PATCH(req, { params }) {
  try {
    const auth = await requirePlatformAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const orgId = parsePositiveInt(id);
    const body = await req.json().catch(() => ({}));
    const planId = parsePositiveInt(body?.planId);

    if (!orgId || !planId) {
      return NextResponse.json(
        { error: "Invalid organization or plan" },
        { status: 400 },
      );
    }

    const result = await changeOrganizationPlan({
      orgId,
      planId,
      adminOrgId: auth.orgId,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "Failed to change organization plan");
  }
}
