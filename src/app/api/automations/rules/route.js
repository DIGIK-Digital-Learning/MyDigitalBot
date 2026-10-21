import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import {
  assertNoActiveInactivityRuleConflict,
  countAutomationRulesByOrg,
  createAutomationRule,
  getOrgAutomationRules,
} from "@/lib/repos/automationRules.repo";
import {
  getOrgLimits,
  hasRoomFor,
  limitReachedBody,
} from "@/lib/services/plans/planLimits";
import {
  assertAssistantBelongsToOrg,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { sanitizeAutomationPayload } from "@/lib/services/automations/automationEngine";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

function normalizeAssistantId(value) {
  if (value === "" || value === undefined || value === null) return null;
  return Number(value);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = Number(searchParams.get("orgId"));

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const items = await getOrgAutomationRules(orgAuth.orgId);

      return NextResponse.json({ items });
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const organizationId = Number(body.organization_id);
    const assistantId = normalizeAssistantId(body.assistant_id);
    const isActive = body.is_active ?? true;
    const triggerType = body.trigger_type;
    const channel = body.channel;

    if (!organizationId || !body.name || !triggerType || !channel) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: organization_id, name, trigger_type, channel",
        },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(organizationId);
    if (orgAuth.error) return orgAuth.error;

    /* Limite de automações do plano (#186): contam todas, ativas e inativas. */
    const orgLimits = await getOrgLimits(orgAuth.orgId);
    const automationCount = await countAutomationRulesByOrg(orgAuth.orgId);

    if (!hasRoomFor(orgLimits.limits.automations, automationCount)) {
      return NextResponse.json(
        limitReachedBody("AUTOMATION_LIMIT_REACHED", "automations", orgLimits),
        { status: 409 },
      );
    }

    const safeAssistantId = await assertAssistantBelongsToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      assistantId,
    );

    if (triggerType === "user.inactive" && isActive) {
      await assertNoActiveInactivityRuleConflict({
        organizationId: orgAuth.orgId,
        channel,
        assistantId: safeAssistantId,
      });
    }

    const row = await createAutomationRule({
      organization_id: orgAuth.orgId,
      name: body.name,
      trigger_type: triggerType,
      assistant_id: safeAssistantId,
      channel,
      delay_minutes: Math.max(0, Number(body.delay_minutes || 0)),
      payload: sanitizeAutomationPayload(body.payload),
      is_active: isActive,
      whatsapp_template_id: null,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.AUTOMATION_CREATED,
      entityType: "automation_rule",
      entityId: row?.id,
      entityLabel: row?.name ?? body.name,
      details: { triggerType, channel, isActive },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const status =
      error?.status || (error?.code === "INACTIVITY_RULE_CONFLICT" ? 409 : 500);

    return NextResponse.json(
      { error: error?.message || String(error) },
      { status },
    );
  }
}
