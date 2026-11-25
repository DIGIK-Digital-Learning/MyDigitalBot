import { NextResponse } from "next/server";
import { requireOwnedOrg, handleApiError } from "@/lib/auth/guards";
import { checkPlanActive } from "@/lib/services/plans/planLimits";
import { materializeDueRuns } from "@/lib/services/automations/materializeRuns";

export async function POST(req) {
  try {
    const body = await req.json();
    const orgAuth = await requireOwnedOrg(body.organizationId);
    if (orgAuth.error) return orgAuth.error;

    /* A Demo terminou (#209): ver continua, criar e enviar não. */
    const active = await checkPlanActive(orgAuth.orgId);
    if (active.body) return NextResponse.json(active.body, { status: 403 });

    const requestedLimit = Number(body.limit ?? 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
      : 100;

    const result = await materializeDueRuns({ organizationId: orgAuth.orgId, limit });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Não foi possível executar a automação");
  }
}
