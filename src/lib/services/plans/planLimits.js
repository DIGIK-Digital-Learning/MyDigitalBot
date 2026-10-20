import { getOrganizationPlan } from "@/lib/repos/plans.repo";

const DAY_MS = 24 * 60 * 60 * 1000;

/* Nome de cada limite no código e a coluna da tabela plan onde está guardado. */
const LIMIT_COLUMNS = {
  users: "max_users",
  assistants: "max_assistants",
  assistantInstructionChars: "max_assistant_instruction_chars",
  filesPerAssistant: "max_files_per_assistant",
  automations: "max_automations",
  scheduledMessages: "max_scheduled_messages",
  trackedLinks: "max_tracked_links",
  dailyMessagesPerChannel: "max_daily_messages_per_channel",
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
 * Ainda cabe? `limit` null quer dizer sem limite. Serve para as verificações
 * das outras issues: "tem 19 assistentes, pode criar mais 1?".
 */
export function hasRoomFor(limit, current, adding = 1) {
  if (limit === null || limit === undefined) return true;
  return current + adding <= limit;
}
