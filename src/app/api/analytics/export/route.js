import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOwnedOrg, handleApiError } from "@/lib/auth/guards";
import { getAnalyticsExportDataset } from "@/lib/services/analytics/analyticsExport.service";

/**
 * Endpoint do dataset de detalhe da exportação.
 *
 * Exige sessão e autorização sobre a organização antes de consultar
 * nomes, emails e telefones. Usa o mesmo guard da route overview.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const auth = await requireOwnedOrg(searchParams.get("orgId"));
    if (auth.error) return auth.error;

    return await withSessionReadAccess(auth, async () => {
      const period = searchParams.get("period") || "all";

      const data = await getAnalyticsExportDataset({
        orgId: auth.orgId,
        period,
      });

      return NextResponse.json(data);
    });
  } catch (err) {
    return handleApiError(err, "Failed to build analytics export");
  }
}
