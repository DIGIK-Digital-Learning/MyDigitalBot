export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { isReadChainsEnabled } from "@/lib/repos/organizationMessagingFeature.repo";
import {
  createMessageChain,
  createMessageChainRecipients,
  createMessageChainSteps,
} from "@/lib/repos/messageChain.repo";
import { sendReadChainStep } from "@/lib/services/broadcast/readChains/sendReadChainStep";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  checkMessageContent,
  claimDailySend,
  releaseDailySend,
  saveTrackedLinksWithinPlan,
} from "@/lib/services/plans/planLimits";
import { setAdminDailySendSource } from "@/lib/repos/adminDailySends.repo";
import {
  attachChainStepQuestions,
  parseChainStepQuestions,
} from "@/lib/services/broadcast/readChains/chainStepQuestions";
import {
  assertUsersBelongToOrg,
  handleApiError,
  requireOwnedOrg,
} from "@/lib/auth/guards";

function normalizeRecipient(raw) {
  if (!raw || typeof raw !== "object") return null;

  const userId = raw.userId ?? raw.id ?? null;

  if (!userId) return null;

  return {
    userId,
  };
}

/*
 * Cada passo é uma mensagem livre, um quiz ou uma pergunta aberta. Quando a
 * janela de 24h está fechada, o envio usa o template de abertura da
 * organização de forma implícita.
 */
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];

  return steps.map((step) => ({
    message: step?.message || "",
    files: Array.isArray(step?.files) ? step.files : [],
    imageUrls: Array.isArray(step?.imageUrls) ? step.imageUrls : [],
    trackedLinks: Array.isArray(step?.trackedLinks) ? step.trackedLinks : [],
    question: step?.question ?? null,
    delayAfterPreviousReadMinutes: normalizeDelayMinutes(
      step?.delayAfterPreviousReadMinutes,
    ),
  }));
}

function stepHasFreeformContent(step) {
  return (
    Boolean(step?.question) ||
    String(step?.message || "").trim().length > 0 ||
    (Array.isArray(step?.files) && step.files.length > 0) ||
    (Array.isArray(step?.imageUrls) && step.imageUrls.length > 0)
  );
}

function parseScheduledFor(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("scheduledFor must be a valid date.");
  }

  return date.toISOString();
}

function normalizeDelayMinutes(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.floor(number);
}

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      orgId,
      channel = "whatsapp",
      recipients: rawRecipients = [],
      steps: rawSteps = [],
      scheduledFor = null,
      timezone = null,
    } = body || {};

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    if (!["whatsapp", "teams"].includes(channel)) {
      return NextResponse.json(
        { error: "Read chains only support WhatsApp and Teams." },
        { status: 400 },
      );
    }

    const scheduledForIso = parseScheduledFor(scheduledFor);
    const isScheduled = Boolean(scheduledForIso);

    if (isScheduled && new Date(scheduledForIso).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "scheduledFor must be in the future." },
        { status: 400 },
      );
    }

    const enabled = await isReadChainsEnabled({
      organizationId: orgAuth.orgId,
      channel,
    });

    if (!enabled) {
      return NextResponse.json(
        { error: "Read chains are disabled for this organization." },
        { status: 403 },
      );
    }

    const recipients = rawRecipients.map(normalizeRecipient).filter(Boolean);

    const dedupedRecipients = Array.from(
      new Map(recipients.map((r) => [String(r.userId), r])).values(),
    );

    if (dedupedRecipients.length === 0) {
      return NextResponse.json(
        { error: "At least one recipient with userId is required." },
        { status: 400 },
      );
    }

    await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      dedupedRecipients.map((recipient) => recipient.userId),
    );

    const steps = normalizeSteps(rawSteps);

    /*
     * Limites do plano (#187): o máximo de passos (antes fixo em 10) e o
     * conteúdo de cada passo (caracteres e ficheiros), lidos de uma vez.
     */
    const content = await checkMessageContent(
      orgAuth.orgId,
      steps.map((step) => ({ message: step.message, files: step.files })),
    );
    const maxSteps = content.orgLimits.limits.chainMessages ?? Infinity;

    if (steps.length < 2 || steps.length > maxSteps) {
      return NextResponse.json(
        {
          error: `A read chain must have between 2 and ${maxSteps} messages.`,
          code: steps.length > maxSteps ? "CHAIN_TOO_LONG" : undefined,
          limit: Number.isFinite(maxSteps) ? maxSteps : null,
        },
        { status: 400 },
      );
    }

    if (content.body) {
      return NextResponse.json(content.body, { status: 400 });
    }

    const emptyStepIndex = steps.findIndex(
      (step) => !stepHasFreeformContent(step),
    );

    if (emptyStepIndex !== -1) {
      return NextResponse.json(
        {
          error: `Message ${emptyStepIndex + 1} is empty. Add text, files, or images.`,
        },
        { status: 400 },
      );
    }

    const parsedQuestions = parseChainStepQuestions(steps);

    if (parsedQuestions.error) {
      return NextResponse.json(
        { error: parsedQuestions.error },
        { status: 400 },
      );
    }

    /*
     * Links rastreados do plano (#189): os links novos entram na biblioteca
     * da organização, até 100. Reutilizar um link guardado não conta.
     */
    const links = await saveTrackedLinksWithinPlan(orgAuth.orgId, steps.flatMap((step) => step.trackedLinks), {
      orgLimits: content.orgLimits,
    });
    if (links.body) {
      return NextResponse.json(links.body, { status: 409 });
    }

    /*
     * Limite diário de envios do canal (#188): uma corrente de N passos
     * conta N, todos no dia em que é criada (agendada ou não). Assim nunca
     * fica parada a meio por falta de envios num dia seguinte.
     */
    const daily = await claimDailySend(orgAuth.orgId, channel, {
      units: steps.length,
      sourceType: "message_chain",
      orgLimits: content.orgLimits,
    });
    if (daily.body) {
      return NextResponse.json(daily.body, { status: 409 });
    }

    let chain;
    try {
      chain = await createMessageChain({
        organizationId: orgAuth.orgId,
        createdByUserId: orgAuth.user.id,
        channel,
        status: isScheduled ? "scheduled" : "active",
        scheduledFor: scheduledForIso,
        timezone: timezone || null,
        recipientCount: dedupedRecipients.length,
      });
    } catch (err) {
      await releaseDailySend(daily.claimKey);
      throw err;
    }

    await setAdminDailySendSource(daily.claimKey, chain.id);

    /*
     * Os passos com pergunta ganham a sua linha em `question`, partilhada
     * por todos os destinatários da cadeia.
     */
    const stepsWithQuestions = await attachChainStepQuestions({
      steps,
      questions: parsedQuestions.questions,
      organizationId: orgAuth.orgId,
      createdByUserId: orgAuth.user.id,
      startAt: scheduledForIso,
    });

    const chainSteps = await createMessageChainSteps({
      chainId: chain.id,
      steps: stepsWithQuestions,
    });

    const chainRecipients = await createMessageChainRecipients({
      chainId: chain.id,
      recipients: dedupedRecipients,
    });

    const firstStep = chainSteps.find((step) => Number(step.step_index) === 1);

    if (!firstStep) {
      return NextResponse.json(
        { error: "Could not create first chain step." },
        { status: 500 },
      );
    }

    const auditReadChain = (extra = {}) =>
      recordAuditEvent(orgAuth, {
        action: AUDIT_ACTIONS.BROADCAST_READ_CHAIN_CREATED,
        entityType: "message_chain",
        entityId: chain.id,
        details: {
          channel,
          recipientCount: dedupedRecipients.length,
          stepCount: steps.length,
          scheduled: isScheduled,
          scheduledFor: scheduledForIso || null,
          ...extra,
        },
      });

    if (isScheduled) {
      await auditReadChain();

      return NextResponse.json({
        ok: dedupedRecipients.length,
        failed: 0,
        sent: 0,
        waitingForReply: 0,
        scheduled: true,
        chainId: chain.id,
        recipientCount: dedupedRecipients.length,
        stepCount: steps.length,
        scheduledFor: scheduledForIso,
        timezone: timezone || null,
        results: chainRecipients.map((chainRecipient) => ({
          userId: chainRecipient.user_id,
          ok: true,
          sent: false,
          scheduled: true,
          waitingForReply: false,
          kind: "scheduled",
          stepIndex: 1,
          error: null,
          warning: null,
        })),
        note: "Read chain scheduled. Message 1 will be sent at the scheduled time, then the next messages will continue after read receipts.",
      });
    }

    const results = [];

    for (const chainRecipient of chainRecipients) {
      try {
        const sendResult = await sendReadChainStep({
          chain,
          chainRecipient,
          chainStep: firstStep,
          stepIndex: 1,
        });

        results.push({
          userId: chainRecipient.user_id,
          ok: sendResult.ok,
          sent: Boolean(sendResult.sent),
          waitingForReply: Boolean(sendResult.waitingForReply),
          kind: sendResult.kind || null,
          stepIndex: 1,
          error: sendResult.error || null,
          warning: sendResult.warning || null,
        });
      } catch (error) {
        results.push({
          userId: chainRecipient.user_id,
          ok: false,
          sent: false,
          waitingForReply: false,
          kind: "error",
          stepIndex: 1,
          error: error.message,
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - okCount;
    const sentCount = results.filter((r) => r.sent).length;
    const waitingCount = results.filter((r) => r.waitingForReply).length;

    await auditReadChain({
      ok: okCount,
      failed: failedCount,
      sent: sentCount,
      waitingForReply: waitingCount,
    });

    return NextResponse.json({
      ok: okCount,
      failed: failedCount,
      sent: sentCount,
      waitingForReply: waitingCount,
      scheduled: false,
      chainId: chain.id,
      recipientCount: dedupedRecipients.length,
      stepCount: steps.length,
      results,
      error:
        okCount === 0
          ? results[0]?.error || "Read chain failed for all recipients."
          : null,
      note:
        waitingCount > 0
          ? "Some recipients had a closed WhatsApp window. The fallback template was sent and the chain step is waiting for their reply."
          : null,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create read chain");
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    route: "/api/broadcast/read-chain",
  });
}
