import { NextResponse } from "next/server";
import {
  countManualQueuedBroadcasts,
  createScheduledBroadcast,
} from "@/lib/repos/scheduledBroadcasts.repo";
import {
  claimDailySend,
  getOrgLimits,
  hasRoomFor,
  limitReachedBody,
  releaseDailySend,
  saveTrackedLinksWithinPlan,
} from "@/lib/services/plans/planLimits";
import { setAdminDailySendSource } from "@/lib/repos/adminDailySends.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { buildScheduledPayload } from "@/lib/services/broadcast/scheduledPayload";
import { messageContentProblem } from "@/lib/plans/messageLimits";

export async function POST(req) {
  try {
    const body = await req.json();

    const { orgId, channel, scheduledFor, timezone, payload } = body;

    if (!orgId || !channel || !scheduledFor || !payload) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    if (!["teams", "whatsapp"].includes(channel)) {
      return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    }

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { error: "Invalid scheduledFor date" },
        { status: 400 },
      );
    }

    if (when.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Scheduled date must be in the future" },
        { status: 400 },
      );
    }

    /*
     * Limite de mensagens agendadas do plano (#186): contam só as agendadas
     * à mão que ainda estão à espera (queued). As das automações não contam
     * e nunca são bloqueadas. Antes de montar o envio, que vai buscar os
     * destinatários: se a conta está cheia, não vale a pena.
     */
    const orgLimits = await getOrgLimits(orgAuth.orgId);
    const queuedCount = await countManualQueuedBroadcasts(orgAuth.orgId);

    if (!hasRoomFor(orgLimits.limits.scheduledMessages, queuedCount)) {
      return NextResponse.json(
        limitReachedBody("SCHEDULED_LIMIT_REACHED", "scheduledMessages", orgLimits),
        { status: 409 },
      );
    }

    /* Conteúdo da mensagem dentro do plano (#187): caracteres e ficheiros. */
    const contentProblem = messageContentProblem(
      {
        message: payload?.message || "",
        files: Array.isArray(payload?.files) ? payload.files : [],
      },
      orgLimits.limits,
    );
    if (contentProblem) {
      return NextResponse.json(
        {
          error: `Plan limit reached: ${contentProblem.code}`,
          code: contentProblem.code,
          plan: orgLimits.plan?.name ?? null,
          limit: contentProblem.limit,
        },
        { status: 400 },
      );
    }

    const built = await buildScheduledPayload({
      orgAuth,
      channel,
      payload,
    });

    if (built.error) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    /*
     * Links rastreados do plano (#189): os links novos entram na biblioteca
     * da organização, até 100. Reutilizar um link guardado não conta.
     */
    const links = await saveTrackedLinksWithinPlan(orgAuth.orgId, built.payload.trackedLinks, {
      orgLimits: orgLimits,
    });
    if (links.body) {
      return NextResponse.json(links.body, { status: 409 });
    }

    /*
     * Limite diário de envios do canal (#188): uma agendada conta no dia em
     * que é agendada, não no dia em que sai. Cancelá-la ou eliminá-la no
     * mesmo dia devolve o envio.
     */
    const daily = await claimDailySend(orgAuth.orgId, channel, {
      sourceType: "scheduled_broadcast",
      orgLimits,
    });
    if (daily.body) {
      return NextResponse.json(daily.body, { status: 409 });
    }

    let row;
    try {
      row = await createScheduledBroadcast({
        organization_id: orgAuth.orgId,
        created_by_user_id: orgAuth.user.id,
        channel,
        status: "queued",
        scheduled_for: when.toISOString(),
        timezone: timezone || null,
        payload: built.payload,
        recipient_count: built.recipientCount,
      });
    } catch (err) {
      await releaseDailySend(daily.claimKey);
      throw err;
    }

    await setAdminDailySendSource(daily.claimKey, row.id);

    const isGroupBroadcast = Array.isArray(built.payload.groupIds);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.BROADCAST_SCHEDULED,
      entityType: "scheduled_broadcast",
      entityId: row?.id,
      details: {
        channel,
        ...(isGroupBroadcast
          ? { groupCount: built.recipientCount }
          : { recipientCount: built.recipientCount }),
        scheduledFor: when.toISOString(),
        timezone: timezone || null,
      },
    });

    return NextResponse.json({ ok: true, item: row });
  } catch (err) {
    return handleApiError(err, "Failed to schedule broadcast");
  }
}
