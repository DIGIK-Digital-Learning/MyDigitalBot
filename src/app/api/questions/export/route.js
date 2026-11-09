import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getQuestionExportByOrg } from "@/lib/repos/questions.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const data = await getQuestionExportByOrg(orgAuth.orgId);
      return NextResponse.json(data);
    });
  } catch (err) {
    return handleApiError(err, "Failed to export questions");
  }
}
