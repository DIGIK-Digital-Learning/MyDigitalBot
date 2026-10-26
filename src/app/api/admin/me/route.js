import { NextResponse } from "next/server";

import { handleApiError, requireUser } from "@/lib/auth/guards";
import { getPlatformAdminStatus } from "@/lib/auth/platformAdmin";
import { getPlanById, getPlanByName } from "@/lib/repos/plans.repo";
import { INTERNAL_PLAN_NAME } from "@/lib/services/plans/platformAdmin.service";

/*
 * Se quem está a ver é administrador da plataforma (#208), para o menu
 * mostrar "Administração" e para a faixa "Estás a experimentar o plano…".
 * Para os clientes devolve só `{ isAdmin: false }`.
 */
export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.error) return auth.error;

    const { org, isAdmin } = await getPlatformAdminStatus(auth);
    if (!isAdmin) return NextResponse.json({ isAdmin: false });

    const [plan, internalPlan] = await Promise.all([
      org.plan_id ? getPlanById(org.plan_id) : null,
      getPlanByName(INTERNAL_PLAN_NAME),
    ]);

    /*
     * "A experimentar" é estar fora do Interno. Sem o plano Interno na base
     * de dados (a migração ainda não correu), não há para onde voltar: não
     * conta como estar a experimentar.
     */
    return NextResponse.json({
      isAdmin: true,
      orgId: org.id,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      internalPlanId: internalPlan?.id ?? null,
      trying:
        Boolean(plan) &&
        Boolean(internalPlan) &&
        plan.name !== INTERNAL_PLAN_NAME,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load admin status");
  }
}
