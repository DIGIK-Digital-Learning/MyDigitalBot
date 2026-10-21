import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { getOrgLimits } from "@/lib/services/plans/planLimits";

/**
 * O plano e os limites da organização, para os ecrãs mostrarem contadores e
 * avisarem antes de enviar (ex.: "3.017 / 5.000" nas instruções). Só o dono
 * da organização os vê. Quem decide é sempre o servidor: isto só ajuda o ecrã.
 */
export async function GET(req) {
  try {
    const orgId = parsePositiveInt(new URL(req.url).searchParams.get("orgId"));

    if (!orgId) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const { plan, limits, expiresAt, expired } = await getOrgLimits(orgAuth.orgId);

    return NextResponse.json({ plan, limits, expiresAt, expired });
  } catch (err) {
    return handleApiError(err, "Failed to load plan limits");
  }
}
