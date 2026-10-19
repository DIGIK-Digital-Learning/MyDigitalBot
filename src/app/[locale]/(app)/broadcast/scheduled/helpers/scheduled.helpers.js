// scheduled.helpers.js
export const FIELD_MAP = {
  id: "id",
  organizationId: "organization_id",
  payload: "payload",
  channel: "channel",
  scheduledFor: "scheduled_for",
  timezone: "timezone",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
  createdBy: "created_by_user_id",
  recipientCount: "recipient_count",
};

export const STATUS_OPTIONS = [
  "all",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
];

export const CHANNEL_OPTIONS = ["all", "teams", "whatsapp"];

export function previewText(text = "", max = 110) {
  if (!text) return "-";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

export function formatDateTime(value, timezone) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
}

export function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toTimeParts(value) {
  if (!value) return { hour: "12", minute: "00" };
  const d = new Date(value);
  return {
    hour: String(d.getHours()).padStart(2, "0"),
    minute: String(d.getMinutes()).padStart(2, "0"),
  };
}

export function buildScheduledIso(date, hour, minute) {
  if (!date) return null;

  const safeHour = Math.max(0, Math.min(23, Number(hour || 0)));
  const safeMinute = Math.max(0, Math.min(59, Number(minute || 0)));

  const localDate = new Date(`${date}T00:00:00`);
  localDate.setHours(safeHour, safeMinute, 0, 0);

  return localDate.toISOString();
}

function normalizeStatus(status = "") {
  const value = String(status || "").toLowerCase();
  if (value === "queued") return "scheduled";
  if (value === "processing") return "sending";
  return value || "scheduled";
}

/* Quiz, sondagem e pergunta aberta (payload.question), ou null. */
export function getPayloadQuestion(payload) {
  const question = payload?.question;

  if (!question || typeof question !== "object") return null;
  if (!["quiz", "survey", "open"].includes(question.kind)) return null;

  return question;
}

function getPayloadMessage(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;

  /* Nas perguntas a mensagem fica vazia e o texto está em question.body. */
  const questionBody = getPayloadQuestion(payload)?.body;

  if (questionBody) return questionBody;

  return (
    payload.message ??
    payload.text ??
    payload.body ??
    payload.content ??
    payload.caption ??
    ""
  );
}

export function normalizeBroadcast(row) {
  const payload = row?.[FIELD_MAP.payload] ?? null;

  return {
    id: row?.[FIELD_MAP.id],
    message: getPayloadMessage(payload),
    questionKind: getPayloadQuestion(payload)?.kind ?? null,
    channel: String(row?.[FIELD_MAP.channel] ?? "teams").toLowerCase(),
    scheduledFor: row?.[FIELD_MAP.scheduledFor] ?? null,
    timezone: row?.[FIELD_MAP.timezone] ?? "Europe/Lisbon",
    status: normalizeStatus(row?.[FIELD_MAP.status]),
    createdAt: row?.[FIELD_MAP.createdAt] ?? null,
    updatedAt: row?.[FIELD_MAP.updatedAt] ?? null,
    createdBy: row?.[FIELD_MAP.createdBy] ?? null,
    recipientsCount: row?.[FIELD_MAP.recipientCount] ?? null,
    payload,
    raw: row,
  };
}

/* O servidor só deixa alterar mensagens que ainda estão na fila. */
export function canEditItem(item) {
  return item.status === "scheduled";
}

export function canDeleteItem(item) {
  return !["sending", "sent"].includes(item.status);
}

/* Grupos do Teams de uma mensagem agendada para grupos (#166), ou null. */
export function getScheduledGroups(item) {
  const payload = item?.payload || {};
  const ids = Array.isArray(payload.groupIds) ? payload.groupIds : [];

  if (!ids.length) return null;

  const names = new Map(
    (Array.isArray(payload.groups) ? payload.groups : []).map((group) => [
      group.id,
      group.name,
    ]),
  );

  return ids.map((id) => ({ id, name: names.get(id) || null }));
}
