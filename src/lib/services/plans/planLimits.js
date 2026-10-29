import { getOrganizationPlan } from "@/lib/repos/plans.repo";
import {
  claimAdminDailySend,
  releaseAdminDailySend,
} from "@/lib/repos/adminDailySends.repo";
import { saveTrackedLinks } from "@/lib/repos/trackedLinkSaved.repo";

import { messageContentProblem } from "@/lib/plans/messageLimits";
import {
  dailySendsDayStart,
  dailySendsResetAt,
} from "@/lib/plans/dailySends";

/* As regras puras vivem em limitRules.js (servem também aos ecrãs). */
export { hasRoomFor, limitKeepingCurrent } from "@/lib/plans/limitRules";

const DAY_MS = 24 * 60 * 60 * 1000;

/* Nome de cada limite no código e a coluna da tabela plan onde está guardado. */
export const LIMIT_COLUMNS = {
  users: "max_users",
  assistants: "max_assistants",
  assistantInstructionChars: "max_assistant_instruction_chars",
  filesPerAssistant: "max_files_per_assistant",
  automations: "max_automations",
  scheduledMessages: "max_scheduled_messages",
  trackedLinks: "max_tracked_links",
  dailyMessagesPerChannel: "max_daily_messages_per_channel",
  collaboratorWeeklyMessages: "max_collaborator_weekly_messages",
  messageChars: "max_message_chars",
  filesPerMessage: "max_files_per_message",
  fileSizeMb: "max_file_size_mb",
  chainMessages: "max_chain_messages",
};

/**
 * Os limites de uma organização e o estado do plano dela. Cada limite é um
 * número, ou null quando o plano não tem limite. O limite de utilizadores pode
 * ser trocado só para esta organização (max_users_override), como já faz a
 * função create_user_with_plan_limit.
 *
 * `expired` diz se um plano com duração (a Demo, 7 dias) já acabou.
 */
export async function getOrgLimits(orgId, { now = new Date(), deps = {} } = {}) {
  const readPlan = deps.getOrganizationPlan || getOrganizationPlan;
  const org = await readPlan(orgId);

  if (!org) {
    throw new Error(`Organization ${orgId} not found`);
  }

  /*
   * Sem plano, não se sabe que limites aplicar. Não pode acontecer depois da
   * migration (a Demo é o plano por omissão), por isso é um erro e não "sem
   * limites", que deixaria a conta usar tudo.
   */
  if (!org.plan) {
    throw new Error(`Organization ${orgId} has no plan`);
  }

  const limits = {};
  for (const [name, column] of Object.entries(LIMIT_COLUMNS)) {
    limits[name] = org.plan[column] ?? null;
  }
  limits.users = org.max_users_override ?? limits.users;

  const startedAt = org.plan_started_at ? new Date(org.plan_started_at) : null;
  const expiresAt =
    startedAt && org.plan.duration_days
      ? new Date(startedAt.getTime() + org.plan.duration_days * DAY_MS)
      : null;

  return {
    plan: { id: org.plan.id, name: org.plan.name, level: org.plan.level },
    limits,
    startedAt,
    expiresAt,
    expired: Boolean(expiresAt) && now >= expiresAt,
  };
}

/**
 * Corpo da resposta 409 quando um limite do plano foi atingido. O ecrã usa o
 * `code` para escolher o aviso e o `plan` e o `limit` para o preencher ("O
 * plano Demo permite até 3 utilizadores"). Sem `orgLimits` (por exemplo, se
 * não foi possível lê-los) vai só o código.
 */
export function limitReachedBody(code, limitName, orgLimits = null) {
  return {
    error: `Plan limit reached: ${limitName}`,
    code,
    plan: orgLimits?.plan?.name ?? null,
    limit: orgLimits?.limits?.[limitName] ?? null,
  };
}

/**
 * Verifica o conteúdo de uma ou mais mensagens (#187): até 1.500 caracteres
 * (contados como a pessoa os vê) e até 5 ficheiros cada. `messages` é uma
 * lista de `{ message, files }` — numa corrente, um por passo.
 *
 * Devolve `{ orgLimits }` se estiver tudo dentro, ou `{ orgLimits, body }`
 * com a resposta 400 a dar (com `step` quando é um passo de uma corrente).
 */
export async function checkMessageContent(orgId, messages, { deps = {} } = {}) {
  const orgLimits = await getOrgLimits(orgId, { deps });
  const list = Array.isArray(messages) ? messages : [messages];

  for (const [index, item] of list.entries()) {
    const problem = messageContentProblem(item || {}, orgLimits.limits);
    if (!problem) continue;

    return {
      orgLimits,
      body: {
        error: `Plan limit reached: ${problem.code}`,
        code: problem.code,
        plan: orgLimits.plan?.name ?? null,
        limit: problem.limit,
        ...(list.length > 1 ? { step: index + 1 } : {}),
      },
    };
  }

  return { orgLimits };
}

/**
 * Corpo da resposta 409 quando o limite diário de envios do canal acabou
 * (#188). Leva o que sobra e quando repõe, para o aviso dizer "repõe às
 * 00:01" e, numa corrente, quantos passos ainda cabem.
 */
export function dailyLimitBody({ channel, used, orgLimits, now = new Date() }) {
  const limit = orgLimits?.limits?.dailyMessagesPerChannel ?? null;

  return {
    error: "Plan limit reached: dailyMessagesPerChannel",
    code: "DAILY_LIMIT_REACHED",
    plan: orgLimits?.plan?.name ?? null,
    limit,
    channel,
    used,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    resetsAt: dailySendsResetAt(now).toISOString(),
  };
}

/**
 * Reserva envios no limite diário do administrador (#188): 1 por envio,
 * seja para quantos colaboradores for; N numa corrente de N passos. A
 * reserva é feita antes de enviar, para dois envios ao mesmo tempo não
 * passarem o limite.
 *
 * Devolve `{ claimKey, used, limit }`, ou `{ body }` com a resposta 409
 * quando não cabe. Se o envio falhar por completo, devolve-se com
 * releaseDailySend(claimKey).
 */
export async function claimDailySend(
  orgId,
  channel,
  {
    units = 1,
    sourceType = "broadcast",
    sourceId = null,
    orgLimits = null,
    now = new Date(),
    deps = {},
  } = {},
) {
  const limits = orgLimits || (await getOrgLimits(orgId, { now, deps }));
  const claim = deps.claimAdminDailySend || claimAdminDailySend;
  const claimKey = (deps.randomUUID || (() => crypto.randomUUID()))();

  const result = await claim({
    organizationId: orgId,
    channel,
    sourceType,
    sourceId,
    units,
    limit: limits.limits.dailyMessagesPerChannel,
    since: dailySendsDayStart(now),
    claimKey,
  });

  if (!result.ok) {
    return {
      body: dailyLimitBody({
        channel,
        used: result.used,
        orgLimits: limits,
        now,
      }),
    };
  }

  return { claimKey, used: result.used, limit: result.limit };
}

/* Devolve uma reserva cujo envio não chegou a ninguém. */
export async function releaseDailySend(claimKey, { deps = {} } = {}) {
  if (!claimKey) return;
  const release = deps.releaseAdminDailySend || releaseAdminDailySend;
  await release(claimKey);
}

/**
 * Grava os links rastreados de um envio na biblioteca da organização (#189)
 * e verifica o limite: 100 links, cada um um par nome + destino. Reutilizar
 * um link que já está guardado não conta; um novo só entra se houver espaço.
 * `links` é a lista `trackedLinks` do envio (numa corrente, de todos os
 * passos juntos).
 *
 * Devolve `{}` quando está tudo dentro, ou `{ body }` com a resposta 409:
 * é preciso eliminar links para criar novos.
 */
export async function saveTrackedLinksWithinPlan(
  orgId,
  links,
  { orgLimits = null, deps = {} } = {},
) {
  const list = (Array.isArray(links) ? links : [])
    .map((link) => ({
      label: String(link?.label || "").trim(),
      destinationUrl: String(link?.destinationUrl || "").trim(),
      key: String(link?.key || "").trim(),
    }))
    .filter((link) => link.label && link.destinationUrl);

  if (!list.length) return {};

  const limits = orgLimits || (await getOrgLimits(orgId, { deps }));
  const save = deps.saveTrackedLinks || saveTrackedLinks;
  const result = await save(orgId, list, limits.limits.trackedLinks);

  if (result.ok) return {};

  return {
    body: {
      error: "Plan limit reached: trackedLinks",
      code: "TRACKED_LINKS_LIMIT_REACHED",
      plan: limits.plan?.name ?? null,
      limit: result.limit,
      used: result.used,
      added: result.added,
    },
  };
}
