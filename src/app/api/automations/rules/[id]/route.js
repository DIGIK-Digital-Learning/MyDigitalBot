import { NextResponse } from "next/server";
import {
  assertNoActiveInactivityRuleConflict,
  deleteAutomationRule,
  updateAutomationRule,
} from "@/lib/repos/automationRules.repo";
import {
  assertAssistantBelongsToOrg,
  requireOrgForAutomationRule,
} from "@/lib/auth/guards";
import { sanitizeAutomationPayload } from "@/lib/services/automations/automationEngine";
import { checkPlanActive } from "@/lib/services/plans/planLimits";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

function normalizeAssistantId(value, fallback) {
  if (value === undefined) return fallback;
  if (value === "" || value === null) return null;
  return Number(value);
}

export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const orgAuth = await requireOrgForAutomationRule(id);
    if (orgAuth.error) return orgAuth.error;

    const existing = orgAuth.rule;

    /*
     * A Demo terminou (#209): editar e desativar continuam, ativar uma
     * automação não.
     */
    if (body.is_active === true && !existing.is_active) {
      const active = await checkPlanActive(orgAuth.orgId);
      if (active.body) return NextResponse.json(active.body, { status: 403 });
    }

    const patch = {};

    if (body.name !== undefined) patch.name = body.name;
    if (body.trigger_type !== undefined) patch.trigger_type = body.trigger_type;

    if (body.assistant_id !== undefined) {
      patch.assistant_id = normalizeAssistantId(body.assistant_id, null);

      patch.assistant_id = await assertAssistantBelongsToOrg(
        orgAuth.admin,
        orgAuth.orgId,
        patch.assistant_id,
      );
    }

    if (body.channel !== undefined) patch.channel = body.channel;

    if (body.delay_minutes !== undefined) {
      patch.delay_minutes = Math.max(0, Number(body.delay_minutes || 0));
    }

    if (body.payload !== undefined) {
      patch.payload = sanitizeAutomationPayload(body.payload);
    }
    if (body.is_active !== undefined) patch.is_active = body.is_active;

    // O template de abertura é implícito; regras antigas deixam de o guardar.
    if (existing.whatsapp_template_id != null) {
      patch.whatsapp_template_id = null;
    }

    const finalRule = {
      ...existing,
      ...patch,
      assistant_id: normalizeAssistantId(
        patch.assistant_id,
        existing.assistant_id ?? null,
      ),
      is_active:
        patch.is_active !== undefined ? patch.is_active : existing.is_active,
      trigger_type: patch.trigger_type ?? existing.trigger_type,
      channel: patch.channel ?? existing.channel,
      organization_id: orgAuth.orgId,
    };

    if (finalRule.trigger_type === "user.inactive" && finalRule.is_active) {
      await assertNoActiveInactivityRuleConflict({
        organizationId: orgAuth.orgId,
        channel: finalRule.channel,
        assistantId: finalRule.assistant_id,
        excludeRuleId: orgAuth.ruleId,
      });
    }

    const updated = await updateAutomationRule(orgAuth.ruleId, patch);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.AUTOMATION_UPDATED,
      entityType: "automation_rule",
      entityId: orgAuth.ruleId,
      entityLabel: updated?.name ?? existing?.name,
      details: { fields: Object.keys(patch) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const status =
      error?.status || (error?.code === "INACTIVITY_RULE_CONFLICT" ? 409 : 500);

    return NextResponse.json(
      { error: error?.message || String(error) },
      { status },
    );
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;

    const orgAuth = await requireOrgForAutomationRule(id);
    if (orgAuth.error) return orgAuth.error;

    await deleteAutomationRule(orgAuth.ruleId);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.AUTOMATION_DELETED,
      entityType: "automation_rule",
      entityId: orgAuth.ruleId,
      entityLabel: orgAuth.rule?.name,
      details: {
        triggerType: orgAuth.rule?.trigger_type ?? null,
        channel: orgAuth.rule?.channel ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
