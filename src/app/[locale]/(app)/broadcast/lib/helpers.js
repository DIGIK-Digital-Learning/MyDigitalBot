import {
  makeEmptyOpenQuestion,
  makeEmptyQuiz,
  makeEmptySurvey,
} from "@/lib/whatsapp/question";

export function getInitial(name = "") {
  return (name?.trim()?.[0] || "?").toUpperCase();
}

export function asList(data, preferredKey = "items") {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[preferredKey])) return data[preferredKey];
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.users)) return data.users;
  return [];
}

/* Horário em que se pode agendar (o mesmo que a validação da hora aceita). */
export const SCHEDULE_FIRST_HOUR = 8;
export const SCHEDULE_LAST_HOUR = 20;
/* A hora escolhe-se numa lista, de 15 em 15 minutos (#235). */
export const SCHEDULE_STEP_MINUTES = 15;

const pad2 = (value) => String(value).padStart(2, "0");

/* "08:00", "08:15", … "20:00": as horas que a lista oferece. */
export function scheduleTimeSlots() {
  const slots = [];
  for (
    let minutes = SCHEDULE_FIRST_HOUR * 60;
    minutes <= SCHEDULE_LAST_HOUR * 60;
    minutes += SCHEDULE_STEP_MINUTES
  ) {
    slots.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
  }
  return slots;
}

/* "HH:MM" de uma data, como nas opções da lista. */
export function timeSlotOf(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/* A mesma data com a hora "HH:MM". */
export function withTimeSlot(date, slot) {
  const [hours, minutes] = String(slot).split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/*
 * Hora proposta ao agendar: pelo menos 5 minutos à frente, arredondada aos 15
 * (a primeira opção da lista que ainda serve) e dentro do horário. Antes das
 * 08:00 propõe as 08:00 desse dia; depois das 20:00, as 08:00 do dia seguinte.
 */
export function buildInitialScheduledDate(now = new Date()) {
  const d = new Date(now.getTime() + 5 * 60 * 1000);
  d.setMinutes(
    Math.ceil(d.getMinutes() / SCHEDULE_STEP_MINUTES) * SCHEDULE_STEP_MINUTES,
    0,
    0,
  );

  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < SCHEDULE_FIRST_HOUR * 60) {
    d.setHours(SCHEDULE_FIRST_HOUR, 0, 0, 0);
  } else if (minutes > SCHEDULE_LAST_HOUR * 60) {
    d.setDate(d.getDate() + 1);
    d.setHours(SCHEDULE_FIRST_HOUR, 0, 0, 0);
  }

  return d;
}

export function formatHour(date) {
  return String(date.getHours()).padStart(2, "0");
}

export function formatMinute(date) {
  return String(date.getMinutes()).padStart(2, "0");
}

export function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeTrackedLinkDraft() {
  return {
    id: makeId(),
    key: "",
    label: "",
    destinationUrl: "",
  };
}

/*
 * Um passo da cadeia é uma mensagem livre ("message"), um quiz ("quiz") ou
 * uma pergunta aberta ("open"). Guarda os três rascunhos para se poder
 * trocar de tipo sem perder o que já estava escrito.
 */
export const CHAIN_STEP_KINDS = ["message", "quiz", "survey", "open"];

export function makeChainStep(overrides = {}) {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "message",
    message: "",
    files: [],
    trackedLinks: [],
    quiz: makeEmptyQuiz(),
    survey: makeEmptySurvey(),
    openQuestion: makeEmptyOpenQuestion(),
    delayAfterPreviousReadMinutes: 0,
    ...overrides,
  };
}

export function isImageContentType(ct = "") {
  return String(ct).toLowerCase().startsWith("image/");
}

export function isVideoContentType(ct = "") {
  return String(ct).toLowerCase().startsWith("video/");
}

export function guessContentTypeFromName(name = "") {
  const n = String(name || "").toLowerCase();

  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".webm")) return "video/webm";

  return "application/octet-stream";
}

export function sanitizeTrackedKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

/* Campos de botão de um link: a marca e, se escrito, o texto do balão. */
export function buttonFieldsOf(link) {
  if (!link?.button) return {};

  const buttonMessage = String(link.buttonMessage || "").trim();

  return { button: true, ...(buttonMessage ? { buttonMessage } : {}) };
}

/* O mesmo link é o mesmo nome com o mesmo destino; a chave pode mudar. */
export function isSameTrackedLink(a, b) {
  return (
    String(a?.label || "").trim() === String(b?.label || "").trim() &&
    String(a?.destinationUrl || "").trim() ===
      String(b?.destinationUrl || "").trim()
  );
}

/* Chave livre no composer: a pedida ou, se já existir, com _2, _3, ... */
export function uniqueTrackedKey(value, takenKeys = []) {
  const base = sanitizeTrackedKey(value) || "link";
  const taken = new Set(takenKeys.map((key) => sanitizeTrackedKey(key)));

  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;

  return `${base}_${n}`;
}

/*
 * Um link já usado entra no composer como um link novo, com o mesmo nome e
 * destino. No envio recebe tokens novos, um por destinatário, como sempre.
 */
export function makeTrackedLinkFromLibrary(item, existingLinks = []) {
  return {
    id: makeId(),
    key: uniqueTrackedKey(
      item?.key || item?.label,
      existingLinks.map((link) => link.key),
    ),
    label: String(item?.label || "").trim(),
    destinationUrl: String(item?.destinationUrl || "").trim(),
  };
}

function foldForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function filterTrackedLinkLibrary(items = [], query = "") {
  const needle = foldForSearch(query).trim();

  if (!needle) return items;

  return items.filter(
    (item) =>
      foldForSearch(item.label).includes(needle) ||
      foldForSearch(item.destinationUrl).includes(needle),
  );
}

export function replaceTrackedPlaceholders(
  str = "",
  trackedLinks = [],
  channel = "teams",
) {
  let out = String(str || "");

  for (const link of trackedLinks) {
    const placeholder = `{{link.${link.key}}}`;
    const replacement =
      channel === "teams"
        ? `[${link.label || link.key}](${placeholder})`
        : placeholder;

    out = out.split(placeholder).join(replacement);
  }

  return out;
}

export function getWhatsappSubline(user) {
  return (
    user.phone_number ||
    (user.whatsapp_username ? `@${user.whatsapp_username}` : "") ||
    user.whatsapp_bsuid ||
    user.bird_contact_id ||
    ""
  );
}

export function formatDelayLabel(minutes, translation) {
  const value = Number(minutes || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return translation("Broadcast.broadcastChain.chainNoDelay");
  }

  const hours = Math.floor(value / 60);
  const remainingMinutes = value % 60;

  if (hours === 0) {
    return translation("Broadcast.broadcastChain.chainDelayMinutes", {
      minutes: remainingMinutes,
    });
  }

  if (remainingMinutes === 0) {
    return translation("Broadcast.broadcastChain.chainDelayHours", {
      hours: hours,
    });
  }

  return translation("Broadcast.broadcastChain.chainDelayMinutesHours", {
    minutes: remainingMinutes,
    hours: hours,
  });
}
