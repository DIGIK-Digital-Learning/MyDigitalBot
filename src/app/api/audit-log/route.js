import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getOrgAuditLog } from "@/lib/repos/auditLog.repo";
import { parseAuditLogQuery } from "@/lib/audit/auditLogQuery";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit-log?orgId=&area=&action=&from=&to=&page=&pageSize=
 *
 * Histórico de atividade da organização, do mais recente para o
 * mais antigo. Só o owner da organização pode consultar.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const rawOrgId = searchParams.get("orgId");

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const parsed = parseAuditLogQuery(searchParams);

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(rawOrgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const { items, total } = await getOrgAuditLog(
        orgAuth.orgId,
        parsed.filters,
      );

      return NextResponse.json({
        items,
        total,
        page: parsed.filters.page,
        pageSize: parsed.filters.pageSize,
      });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load activity log");
  }
}
