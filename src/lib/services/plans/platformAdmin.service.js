import {
  getPlanById,
  listOrganizationsWithPlan,
  listOwnerEmails,
  listPlans,
  setOrganizationPlan,
  setOrganizationPlanStart,
  updatePlan,
} from "@/lib/repos/plans.repo";
import { platformAdminOrgIds } from "@/lib/auth/platformAdmin";
import { countUsersByOrg } from "@/lib/repos/user.repo";
import { countAssistantsByOrg } from "@/lib/repos/assistants.repo";
import { countAutomationRulesByOrg } from "@/lib/repos/automationRules.repo";
import { countManualQueuedBroadcasts } from "@/lib/repos/scheduledBroadcasts.repo";
import { countAdminDailySends } from "@/lib/repos/adminDailySends.repo";
import { countSavedTrackedLinks } from "@/lib/repos/trackedLinkSaved.repo";
import {
  dailySendsDayStart,
  lisbonParts,
  lisbonWallTime,
} from "@/lib/plans/dailySends";
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

/* Os limites que a organização já passou (por exemplo, 4 utilizadores com 3). */
const OVER_LIMIT_CHECKS = [
  "users",
  "assistants",
  "automations",
  "scheduledMessages",
  "trackedLinks",
];

function limitsOver(usage, limits) {
  if (!limits) return [];
  return OVER_LIMIT_CHECKS.filter(
    (name) => limits[name] != null && usage[name] > limits[name],
  );
}

/* Quando acaba um plano com prazo (a Demo). */
function planExpiry(startedAt, durationDays) {
  return startedAt && durationDays
    ? new Date(startedAt.getTime() + durationDays * DAY_MS)
    : null;
}

/* As organizações da DIGIK (1 e 2): só elas podem ter o plano Interno. */
function isPlatformOrg(orgId) {
  return platformAdminOrgIds().includes(Number(orgId));
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
  /* O email do dono é só informação: se falhar, a página mostra o resto. */
  const ownerEmails = await listOwnerEmails(
    orgRows.map((org) => org.owner_user_id),
  ).catch((error) => {
    console.warn("[Admin] owner emails unavailable", error?.message);
    return {};
  });

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
      const expiresAt = planExpiry(startedAt, plan?.durationDays);
      const limits = plan
        ? { ...plan.limits, users: org.max_users_override ?? plan.limits.users }
        : null;
      const usage = await organizationUsage(org.id, now);

      return {
        id: org.id,
        name: org.name,
        ownerEmail: ownerEmails[org.owner_user_id] ?? null,
        isPlatformOrg: isPlatformOrg(org.id),
        overLimits: limitsOver(usage, limits),
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
        limits,
        usage,
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

  /* O Interno (sem limites) é só da DIGIK: um clique por engano não o dá. */
  if (plan.name === INTERNAL_PLAN_NAME && !isPlatformOrg(orgId)) {
    return { error: "INTERNAL_PLAN_RESERVED" };
  }

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

/**
 * Prolonga um plano com prazo (a Demo) sem mudar de plano: mais `days` dias
 * a partir do fim atual, ou de hoje se já tiver terminado. Fica no histórico
 * do cliente.
 */
export async function extendOrganizationPlan({
  orgId,
  days = 7,
  adminOrgId,
  now = new Date(),
}) {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { error: "INVALID_DAYS" };
  }

  const org = (await listOrganizationsWithPlan()).find(
    (row) => Number(row.id) === Number(orgId),
  );
  if (!org) return { error: "ORG_NOT_FOUND" };

  const plan = org.plan_id ? await getPlanById(org.plan_id) : null;
  if (!plan?.duration_days) return { error: "PLAN_HAS_NO_DURATION" };

  const startedAt = org.plan_started_at ? new Date(org.plan_started_at) : now;
  const currentEnd = planExpiry(startedAt, plan.duration_days);
  const from = currentEnd > now ? currentEnd : now;
  const newEnd = new Date(from.getTime() + days * DAY_MS);
  const newStart = new Date(newEnd.getTime() - plan.duration_days * DAY_MS);

  await setOrganizationPlanStart(orgId, newStart);

  if (Number(orgId) !== Number(adminOrgId)) {
    await recordSystemAuditEvent(orgId, {
      action: AUDIT_ACTIONS.ORGANIZATION_PLAN_EXTENDED,
      entityType: "organization",
      entityId: orgId,
      details: { plan: plan.name, days, until: newEnd.toISOString() },
    });
  }

  return { expiresAt: newEnd };
}

/* O máximo que se pode dar de uma vez a uma Demo. */
const MAX_END_DAYS_AHEAD = 90;

/* "2026-11-04" → o fim desse dia em Lisboa (23:59), ou null se inválida. */
function endOfLisbonDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
    return null;

  return lisbonWallTime(year, month, day, 23, 59);
}

/**
 * Escolhe o dia em que um plano com prazo (a Demo) termina: corrige um
 * "+7 dias" a mais ou dá um prazo à medida. O dia escolhido conta até às
 * 23:59 de Lisboa; não pode ser antes de hoje nem mais de 90 dias à frente.
 * Fica no histórico do cliente.
 */
export async function setOrganizationPlanEnd({
  orgId,
  endsOn,
  adminOrgId,
  now = new Date(),
}) {
  const endsAt = endOfLisbonDay(endsOn);
  if (!endsAt) return { error: "INVALID_DATE" };

  const today = lisbonParts(now);
  const todayEnd = lisbonWallTime(today.year, today.month, today.day, 23, 59);
  if (endsAt < todayEnd) return { error: "DATE_IN_THE_PAST" };
  if (endsAt.getTime() - now.getTime() > MAX_END_DAYS_AHEAD * DAY_MS) {
    return { error: "DATE_TOO_FAR" };
  }

  const org = (await listOrganizationsWithPlan()).find(
    (row) => Number(row.id) === Number(orgId),
  );
  if (!org) return { error: "ORG_NOT_FOUND" };

  const plan = org.plan_id ? await getPlanById(org.plan_id) : null;
  if (!plan?.duration_days) return { error: "PLAN_HAS_NO_DURATION" };

  const newStart = new Date(endsAt.getTime() - plan.duration_days * DAY_MS);
  await setOrganizationPlanStart(orgId, newStart);

  if (Number(orgId) !== Number(adminOrgId)) {
    await recordSystemAuditEvent(orgId, {
      action: AUDIT_ACTIONS.ORGANIZATION_PLAN_END_CHANGED,
      entityType: "organization",
      entityId: orgId,
      details: { plan: plan.name, until: endsAt.toISOString() },
    });
  }

  return { expiresAt: endsAt };
}

export async function updatePlanLimits(planId, input) {
  /* O Interno é o plano sem limites da DIGIK: não se edita. */
  const current = await getPlanById(planId);
  if (!current) return { error: "PLAN_NOT_FOUND" };
  if (current.name === INTERNAL_PLAN_NAME)
    return { error: "INTERNAL_PLAN_LOCKED" };

  const { patch, error } = planLimitsPatch(input);
  if (error) return { error };
  if (!Object.keys(patch).length) return { error: "Nothing to update" };

  const row = await updatePlan(planId, patch);
  if (!row) return { error: "PLAN_NOT_FOUND" };

  return { plan: toPlanView(row) };
}
