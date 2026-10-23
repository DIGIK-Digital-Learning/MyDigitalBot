/**
 * Catálogo das ações registadas no histórico de atividade
 * e construção das linhas da tabela audit_log.
 *
 * Este módulo é puro: não fala com a base de dados,
 * por isso pode ser testado sem mocks.
 */

/**
 * Cada ação tem o formato "entidade.verbo".
 *
 * A parte antes do ponto é o tipo do elemento afetado
 * e é usada para filtrar o histórico por área.
 */
export const AUDIT_ACTIONS = Object.freeze({
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_BULK_UPDATED: "user.bulk_updated",
  USER_BULK_DELETED: "user.bulk_deleted",
  USER_TAGS_UPDATED: "user.tags_updated",
  USER_IMPORTED: "user.imported",

  TAG_CREATED: "tag.created",
  TAG_UPDATED: "tag.updated",
  TAG_DELETED: "tag.deleted",

  ASSISTANT_CREATED: "assistant.created",
  ASSISTANT_UPDATED: "assistant.updated",
  ASSISTANT_DELETED: "assistant.deleted",
  ASSISTANT_FILES_ADDED: "assistant.files_added",
  ASSISTANT_FILES_REMOVED: "assistant.files_removed",

  AUTOMATION_CREATED: "automation.created",
  AUTOMATION_UPDATED: "automation.updated",
  AUTOMATION_DELETED: "automation.deleted",
  AUTOMATION_TRIGGERED: "automation.triggered",

  BROADCAST_SENT: "broadcast.sent",
  BROADCAST_SCHEDULED: "broadcast.scheduled",
  BROADCAST_SCHEDULE_UPDATED: "broadcast.schedule_updated",
  BROADCAST_SCHEDULE_DELETED: "broadcast.schedule_deleted",
  BROADCAST_SCHEDULED_SENT: "broadcast.scheduled_sent",
  BROADCAST_READ_CHAIN_CREATED: "broadcast.read_chain_created",

  MESSAGE_TEMPLATE_SENT: "message.template_sent",
  MESSAGE_RECEIVED: "message.received",

  TEMPLATE_CREATED: "template.created",

  MEDIA_DELETED: "media.deleted",

  TRACKED_LINK_DELETED: "tracked_link.deleted",

  ORGANIZATION_CREATED: "organization.created",
  ORGANIZATION_SETTINGS_UPDATED: "organization.settings_updated",
  ORGANIZATION_PLAN_CHANGED: "organization.plan_changed",

  TEAMS_GROUP_UPDATED: "teams_group.updated",
});

export const AUDIT_ACTION_LIST = Object.freeze(Object.values(AUDIT_ACTIONS));

/**
 * Áreas do histórico: os prefixos únicos das ações, pela ordem
 * em que aparecem no catálogo. Usadas para filtrar a lista.
 */
export const AUDIT_AREAS = Object.freeze([
  ...new Set(AUDIT_ACTION_LIST.map((action) => action.split(".")[0])),
]);

export const AUDIT_ACTOR_TYPES = Object.freeze({
  USER: "user",
  SYSTEM: "system",
});

/**
 * Tipos de elemento afetado. O tipo por omissão é a parte
 * da ação antes do ponto, mas algumas ações agem sobre um
 * elemento diferente do prefixo (por exemplo, um envio de
 * template age sobre um utilizador).
 */
export const AUDIT_ENTITY_TYPES = Object.freeze({
  USER: "user",
  TAG: "tag",
  ASSISTANT: "assistant",
  AUTOMATION_RULE: "automation_rule",
  BROADCAST: "broadcast",
  SCHEDULED_BROADCAST: "scheduled_broadcast",
  MESSAGE_CHAIN: "message_chain",
  WHATSAPP_TEMPLATE: "whatsapp_template",
  ORGANIZATION: "organization",
  TEAMS_GROUP: "teams_group",
  TRACKED_LINK: "tracked_link",
});

const MAX_LABEL_LENGTH = 200;

const knownActions = new Set(AUDIT_ACTION_LIST);

export function isKnownAuditAction(action) {
  return typeof action === "string" && knownActions.has(action);
}

/**
 * Devolve o prefixo da ação: "user.created" -> "user".
 */
export function auditAreaFromAction(action) {
  if (typeof action !== "string") return null;

  const index = action.indexOf(".");

  return index > 0 ? action.slice(0, index) : null;
}

/**
 * Nomes dos campos que vieram preenchidos num pedido de atualização,
 * para registar "o que mudou" sem guardar os valores.
 */
export function providedFields(input = {}) {
  if (!isPlainObject(input)) return [];

  return Object.keys(input).filter((key) => input[key] !== undefined);
}

function normalizeEntityId(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
}

function normalizeLabel(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  return text.length > MAX_LABEL_LENGTH
    ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : text;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Garante que details é um objeto simples serializável em JSON,
 * sem valores undefined nem funções.
 */
function normalizeDetails(value) {
  if (!isPlainObject(value)) return {};

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function normalizeActor(actor = {}) {
  const type =
    actor?.type === AUDIT_ACTOR_TYPES.SYSTEM
      ? AUDIT_ACTOR_TYPES.SYSTEM
      : AUDIT_ACTOR_TYPES.USER;

  const userId =
    typeof actor?.userId === "string" && actor.userId.trim()
      ? actor.userId.trim()
      : null;

  const email =
    typeof actor?.email === "string" && actor.email.trim()
      ? actor.email.trim()
      : null;

  if (type === AUDIT_ACTOR_TYPES.USER && !userId) {
    throw new Error("Audit event with actor type user requires a userId");
  }

  return { type, userId, email };
}

/**
 * Constrói a linha a inserir em audit_log.
 *
 * Lança erro quando falta informação essencial, para que
 * um registo mal formado seja apanhado nos testes e não
 * em produção.
 */
export function buildAuditRow({
  organizationId,
  actor,
  action,
  entityType,
  entityId,
  entityLabel,
  details,
} = {}) {
  const orgId = Number(organizationId);

  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error("Audit event requires a valid organizationId");
  }

  if (!isKnownAuditAction(action)) {
    throw new Error(`Unknown audit action: ${String(action)}`);
  }

  const resolvedEntityType =
    typeof entityType === "string" && entityType.trim()
      ? entityType.trim()
      : auditAreaFromAction(action);

  const normalizedActor = normalizeActor(actor);

  return {
    organization_id: orgId,
    actor_type: normalizedActor.type,
    actor_user_id: normalizedActor.userId,
    actor_email: normalizedActor.email,
    action,
    entity_type: resolvedEntityType,
    entity_id: normalizeEntityId(entityId),
    entity_label: normalizeLabel(entityLabel),
    details: normalizeDetails(details),
  };
}
