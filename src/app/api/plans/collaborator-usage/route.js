import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { getOrgLimits } from "@/lib/services/plans/planLimits";
import { getCollaboratorWeeklyUsage } from "@/lib/repos/collaboratorWeeklyMessages.repo";
import {
  weeklyMessagesResetAt,
  weeklyMessagesWeekStart,
} from "@/lib/plans/weeklyMessages";

/**
 * Quantas mensagens cada colaborador já usou esta semana, por canal, para a
 * página de Utilizadores ("WhatsApp 37 / 100"). Só o dono da organização as
 * vê; o colaborador nunca vê números.
 */
export async function GET(req) {
  try {
    const orgId = parsePositiveInt(new URL(req.url).searchParams.get("orgId"));

    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const now = new Date();
    const [{ limits }, usage] = await Promise.all([
      getOrgLimits(orgAuth.orgId, { now }),
      getCollaboratorWeeklyUsage(orgAuth.orgId, weeklyMessagesWeekStart(now)),
    ]);

    return NextResponse.json({
      limit: limits.collaboratorWeeklyMessages,
      resetsAt: weeklyMessagesResetAt(now),
      usage,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load collaborator weekly usage");
  }
}
