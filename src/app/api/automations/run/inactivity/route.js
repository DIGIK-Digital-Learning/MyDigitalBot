import { NextResponse } from "next/server";
import { requireOwnedOrg, handleApiError } from "@/lib/auth/guards";
import { checkPlanActive } from "@/lib/services/plans/planLimits";
import { runInactivityScan } from "@/lib/services/automations/inactivityScan";

export async function POST(req) {
  try {
    const body = await req.json();
    const orgAuth = await requireOwnedOrg(body.organizationId);
    if (orgAuth.error) return orgAuth.error;

    /* A Demo terminou (#209): ver continua, criar e enviar não. */
    const active = await checkPlanActive(orgAuth.orgId);
    if (active.body) return NextResponse.json(active.body, { status: 403 });

    const result = await runInactivityScan({ organizationId: orgAuth.orgId });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Não foi possível executar a automação");
  }
}
