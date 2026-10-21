import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { getOrgLimits } from "@/lib/services/plans/planLimits";
import { countAutomationRulesByOrg } from "@/lib/repos/automationRules.repo";
import { countManualQueuedBroadcasts } from "@/lib/repos/scheduledBroadcasts.repo";

/**
 * O plano, os limites e quanto já está gasto, para os ecrãs mostrarem
 * contadores ("6 / 20" automações, "2 / 100" agendadas) e avisarem antes de
 * enviar. Só o dono da organização os vê. Quem decide é sempre o servidor:
 * isto só ajuda o ecrã.
 */
export async function GET(req) {
  try {
    const orgId = parsePositiveInt(new URL(req.url).searchParams.get("orgId"));

    if (!orgId) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    /*
     * O "gasto" usa as mesmas contagens que as rotas usam para recusar: o
     * número que se vê no ecrã ("6 / 20") é o que o servidor compara.
     */
    const [{ plan, limits, expiresAt, expired }, automations, scheduledMessages] =
      await Promise.all([
        getOrgLimits(orgAuth.orgId),
        countAutomationRulesByOrg(orgAuth.orgId),
        countManualQueuedBroadcasts(orgAuth.orgId),
      ]);

    return NextResponse.json({
      plan,
      limits,
      usage: { automations, scheduledMessages },
      expiresAt,
      expired,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load plan limits");
  }
}
