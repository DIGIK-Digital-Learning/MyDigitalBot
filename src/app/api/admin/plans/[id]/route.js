import { NextResponse } from "next/server";

import { handleApiError, parsePositiveInt } from "@/lib/auth/guards";
import { requirePlatformAdmin } from "@/lib/auth/platformAdmin";
import { updatePlanLimits } from "@/lib/services/plans/platformAdmin.service";

/*
 * Edita os limites de um plano (#208). Muda logo para todas as organizações
 * nesse plano; o ecrã pede confirmação antes.
 */
export async function PATCH(req, { params }) {
  try {
    const auth = await requirePlatformAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const planId = parsePositiveInt(id);
    if (!planId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await updatePlanLimits(planId, body);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "PLAN_NOT_FOUND" ? 404 : 400 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "Failed to update plan");
  }
}
