import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getQuestionReportDetail } from "@/lib/repos/questions.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));
    const questionId = Number(searchParams.get("questionId"));

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      if (!Number.isInteger(questionId) || questionId <= 0) {
        return NextResponse.json(
          { error: "Missing required params" },
          { status: 400 },
        );
      }

      const result = await getQuestionReportDetail({
        orgId: orgAuth.orgId,
        questionId,
      });

      if (!result) {
        return NextResponse.json(
          { error: "Question not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(result);
    });
  } catch (err) {
    return handleApiError(err, "Failed to load question report detail");
  }
}
