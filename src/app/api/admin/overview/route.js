import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/auth/guards";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { getAdminOverview } from "@/lib/services/plans/platformAdmin.service";

/* Os planos e todas as organizações, com o plano e o uso (#208). */
export async function GET() {
  try {
    const auth = await requirePlatformAdmin();
    if (auth.error) return auth.error;

    const overview = await getAdminOverview();

    return NextResponse.json({ ...overview, adminOrgId: auth.orgId });
  } catch (err) {
    return handleApiError(err, "Failed to load admin overview");
  }
}
