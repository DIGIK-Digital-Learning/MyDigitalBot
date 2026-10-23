import {
  getPlanById,
  listOrganizationsWithPlan,
  listPlans,
  setOrganizationPlan,
  updatePlan,
} from "@/lib/repos/plans.repo";
import { countUsersByOrg } from "@/lib/repos/user.repo";
import { countAssistantsByOrg } from "@/lib/repos/assistants.repo";
import { countAutomationRulesByOrg } from "@/lib/repos/automationRules.repo";
import { countManualQueuedBroadcasts } from "@/lib/repos/scheduledBroadcasts.repo";
import { countAdminDailySends } from "@/lib/repos/adminDailySends.repo";
import { countSavedTrackedLinks } from "@/lib/repos/trackedLinkSaved.repo";
import { dailySendsDayStart } from "@/lib/plans/dailySends";
import { recordSystemAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

import { LIMIT_COLUMNS } from "./planLimits";

/*
 * Área de administração dos planos (#208), só para a equipa DIGIK: os planos
 * com os limites, e as organizações com o plano e o que já gastaram.
 */

export const INTERNAL_PLAN_NAME = "Interno";

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Máximos técnicos, que nenhum plano pode passar: a base de dados só aceita
 * correntes até 10 passos e o Storage ficheiros até 50 MB.
 */
const TECHNICAL_MAX = { chainMessages: 10, fileSizeMb: 50 };

/* Um plano com os limites pelos nomes do código ("users", "trackedLinks"…). */
function toPlanView(row, orgCount = 0) {
  const limits = {};
  for (const [name, column] of Object.entries(LIMIT_COLUMNS)) {
    limits[name] = row[column] ?? null;
  }

  return {
    id: row.id,
    name: row.name,
    level: row.level,
    isPublic: row.is_public !== false,
    durationDays: row.duration_days ?? null,
    limits,
    orgCount,
  };
}

async function organizationUsage(orgId, now) {
  const [
    users,
    assistants,
    automations,
    scheduledMessages,
    dailySends,
    trackedLinks,
  ] = await Promise.all([
    countUsersByOrg(orgId),
    countAssistantsByOrg(orgId),
    countAutomationRulesByOrg(orgId),
    countManualQueuedBroadcasts(orgId),
    countAdminDailySends(orgId, dailySendsDayStart(now)),
    countSavedTrackedLinks(orgId),
  ]);

  return {
    users,
    assistants,
    automations,
    scheduledMessages,
    dailySends,
    trackedLinks,
  };
}

/**
 * Tudo o que a página de administração mostra: os planos e cada organização
 * com o plano, os dias que faltam (num plano com prazo, como a Demo) e o uso
 * de cada limite.
 */
export async function getAdminOverview({ now = new Date() } = {}) {
  const [planRows, orgRows] = await Promise.all([
    listPlans(),
    listOrganizationsWithPlan(),
  ]);

  const orgCountByPlan = {};
  for (const org of orgRows) {
    orgCountByPlan[org.plan_id] = (orgCountByPlan[org.plan_id] || 0) + 1;
  }

  const plans = planRows.map((row) =>
    toPlanView(row, orgCountByPlan[row.id] || 0),
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const organizations = await Promise.all(
    orgRows.map(async (org) => {
      const plan = planById.get(org.plan_id) || null;
      const startedAt = org.plan_started_at
        ? new Date(org.plan_started_at)
        : null;
      const expiresAt =
        startedAt && plan?.durationDays
          ? new Date(startedAt.getTime() + plan.durationDays * DAY_MS)
          : null;

      return {
        id: org.id,
        name: org.name,
        plan: plan ? { id: plan.id, name: plan.name } : null,
        startedAt,
        expiresAt,
        expired: Boolean(expiresAt) && now >= expiresAt,
        daysLeft: expiresAt
          ? Math.max(
              Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS),
              0,
            )
          : null,
        limits: plan
          ? {
              ...plan.limits,
              users: org.max_users_override ?? plan.limits.users,
            }
          : null,
        usage: await organizationUsage(org.id, now),
      };
    }),
  );

  return {
    plans,
    organizations,
    internalPlanId:
      plans.find((plan) => plan.name === INTERNAL_PLAN_NAME)?.id ?? null,
  };
}

/**
 * Muda o plano de uma organização. O início passa a ser agora (a Demo conta
 * 7 dias a partir daqui). Fica no histórico do cliente como "Sistema", menos
 * quando é a própria organização do administrador a experimentar um plano.
 */
export async function changeOrganizationPlan({
  orgId,
  planId,
  adminOrgId,
  now = new Date(),
}) {
  const plan = await getPlanById(planId);
  if (!plan) return { error: "PLAN_NOT_FOUND" };

  const previous = (await listOrganizationsWithPlan()).find(
    (org) => Number(org.id) === Number(orgId),
  );
  if (!previous) return { error: "ORG_NOT_FOUND" };

  const updated = await setOrganizationPlan(orgId, planId, { now });

  if (Number(orgId) !== Number(adminOrgId)) {
    const previousPlan = previous.plan_id
      ? await getPlanById(previous.plan_id)
      : null;

    await recordSystemAuditEvent(orgId, {
      action: AUDIT_ACTIONS.ORGANIZATION_PLAN_CHANGED,
      entityType: "organization",
      entityId: orgId,
      details: { from: previousPlan?.name ?? null, to: plan.name },
    });
  }

  return { organization: updated, plan: toPlanView(plan) };
}

/**
 * Valida os limites editados: um número inteiro positivo, ou null para "sem
 * limite". Devolve `{ patch }` com os nomes das colunas, ou `{ error }`.
 */
export function planLimitsPatch(input = {}) {
  const patch = {};

  for (const [name, value] of Object.entries(input.limits || {})) {
    const column = LIMIT_COLUMNS[name];
    if (!column) return { error: `Unknown limit: ${name}` };

    if (value === null || value === "") {
      patch[column] = null;
      continue;
    }

    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) {
      return { error: `Invalid value for ${name}` };
    }
    if (TECHNICAL_MAX[name] && number > TECHNICAL_MAX[name]) {
      return { error: `${name} cannot be above ${TECHNICAL_MAX[name]}` };
    }
    patch[column] = number;
  }

  if ("durationDays" in input) {
    const value = input.durationDays;
    if (value === null || value === "") {
      patch.duration_days = null;
    } else if (Number.isInteger(Number(value)) && Number(value) > 0) {
      patch.duration_days = Number(value);
    } else {
      return { error: "Invalid value for durationDays" };
    }
  }

  return { patch };
}

export async function updatePlanLimits(planId, input) {
  const { patch, error } = planLimitsPatch(input);
  if (error) return { error };
  if (!Object.keys(patch).length) return { error: "Nothing to update" };

  const row = await updatePlan(planId, patch);
  if (!row) return { error: "PLAN_NOT_FOUND" };

  return { plan: toPlanView(row) };
}
