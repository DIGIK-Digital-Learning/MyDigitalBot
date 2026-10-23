import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { getOrgLimits } from "@/lib/services/plans/planLimits";
import { countAssistantsByOrg } from "@/lib/repos/assistants.repo";
import { countUsersByOrg } from "@/lib/repos/user.repo";
import { countAutomationRulesByOrg } from "@/lib/repos/automationRules.repo";
import { countManualQueuedBroadcasts } from "@/lib/repos/scheduledBroadcasts.repo";
import { countAdminDailySends } from "@/lib/repos/adminDailySends.repo";
import {
  dailySendsDayStart,
  dailySendsResetAt,
} from "@/lib/plans/dailySends";

/**
 * O plano, os limites e quanto já está gasto, para os ecrãs mostrarem
 * contadores ("6 / 20" automações, "2 / 100" agendadas, "3 / 10" envios
 * de hoje em cada canal) e avisarem antes de enviar. Só o dono da organização os vê. Quem decide é sempre o servidor:
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
    const now = new Date();
    const [
      { plan, limits, expiresAt, expired },
      users,
      assistants,
      automations,
      scheduledMessages,
      dailySends,
    ] = await Promise.all([
      getOrgLimits(orgAuth.orgId),
      countUsersByOrg(orgAuth.orgId),
      countAssistantsByOrg(orgAuth.orgId),
      countAutomationRulesByOrg(orgAuth.orgId),
      countManualQueuedBroadcasts(orgAuth.orgId),
      countAdminDailySends(orgAuth.orgId, dailySendsDayStart(now)),
    ]);

    return NextResponse.json({
      plan,
      limits,
      usage: { users, assistants, automations, scheduledMessages, dailySends },
      /* Quando os envios de hoje voltam a 0 (00:01 de Lisboa, #188). */
      dailySendsResetAt: dailySendsResetAt(now),
      expiresAt,
      expired,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load plan limits");
  }
}
