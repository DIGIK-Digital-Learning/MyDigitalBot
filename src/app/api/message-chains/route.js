import { NextResponse } from "next/server";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { listOpenChains } from "@/lib/services/broadcast/readChains/openChains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Correntes agendadas e a decorrer da organização (Mensagens agendadas). */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawOrgId = searchParams.get("orgId");

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(rawOrgId);
    if (orgAuth.error) return orgAuth.error;

    const items = await listOpenChains(orgAuth.orgId);

    return NextResponse.json({ items });
  } catch (err) {
    return handleApiError(err, "Failed to load message chains");
  }
}
