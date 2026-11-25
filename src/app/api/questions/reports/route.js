import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getQuestionReportsByOrg } from "@/lib/repos/questions.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const items = await getQuestionReportsByOrg(orgAuth.orgId);
      return NextResponse.json({ items });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load question reports");
  }
}
