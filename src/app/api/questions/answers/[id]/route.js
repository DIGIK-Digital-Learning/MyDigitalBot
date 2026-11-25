import { NextResponse } from "next/server";
import { updateQuestionAnswerAdminVerdict } from "@/lib/repos/questions.repo";
import { VERDICTS } from "@/lib/services/questions/questionReports";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

/**
 * Correção manual do veredicto de uma resposta a pergunta aberta. Um valor
 * nulo volta ao veredicto da IA. Corrigir também tira a resposta da lista
 * de revisão.
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const answerId = Number(id);
    const body = await req.json().catch(() => ({}));

    const orgAuth = await requireOwnedOrg(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    if (!Number.isInteger(answerId) || answerId <= 0) {
      return NextResponse.json({ error: "Invalid answer id" }, { status: 400 });
    }

    const adminVerdict = body?.adminVerdict ?? null;

    if (adminVerdict !== null && !VERDICTS.includes(adminVerdict)) {
      return NextResponse.json(
        { error: `adminVerdict must be one of ${VERDICTS.join(", ")} or null` },
        { status: 400 },
      );
    }

    const item = await updateQuestionAnswerAdminVerdict({
      id: answerId,
      orgId: orgAuth.orgId,
      adminVerdict,
    });

    if (!item) {
      return NextResponse.json({ error: "Answer not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return handleApiError(err, "Failed to update the answer verdict");
  }
}
