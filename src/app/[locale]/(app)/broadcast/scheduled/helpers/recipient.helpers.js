export function cleanText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export function looksLikeWhatsappBsuid(value) {
  return /^[A-Z]{2}\.\d+$/i.test(cleanText(value));
}

function normalizeDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

export function phonesMatch(a, b) {
  const da = normalizeDigits(a);
  const db = normalizeDigits(b);

  if (!da || !db) return false;

  return da === db || da.endsWith(db) || db.endsWith(da);
}

export function normalizeUser(user = {}) {
  return {
    ...user,

    id: cleanText(user.id),
    name: cleanText(user.name || user.user || user.nome) || "Sem nome",
    email: cleanText(user.email),

    phoneNumber:
      cleanText(user.phone_number) ||
      cleanText(user.phoneNumber) ||
      cleanText(user.phone),

    phoneCountryCode:
      cleanText(user.phone_country_code) || cleanText(user.phoneCountryCode),

    phoneNational:
      cleanText(user.phone_national) || cleanText(user.phoneNational),

    teamsAadObjectId:
      cleanText(user.teams_aad_object_id) || cleanText(user.teamsAadObjectId),

    teamsFromId: cleanText(user.teams_from_id) || cleanText(user.teamsFromId),

    whatsappBsuid:
      cleanText(user.whatsapp_bsuid) ||
      cleanText(user.whatsappBsuid) ||
      cleanText(user.whatsappPsuid),

    whatsappUsername:
      cleanText(user.whatsapp_username) || cleanText(user.whatsappUsername),

    birdContactId:
      cleanText(user.bird_contact_id) || cleanText(user.birdContactId),
  };
}

export function getWhatsAppPhone(user) {
  const normalized = normalizeUser(user);

  if (normalized.phoneNumber) return normalized.phoneNumber;

  const code = normalized.phoneCountryCode;
  const national = normalized.phoneNational.replace(/\s+/g, "");

  if (code && national) return `${code}${national}`;

  return "";
}

export function getRecipientForChannel(user, channel) {
  const normalized = normalizeUser(user);

  if (channel === "teams") {
    /* O servidor só aceita o id do utilizador, não os ids do Teams. */
    const userId =
      normalized.id ||
      normalized.teamsFromId ||
      normalized.teamsAadObjectId ||
      "";

    if (!userId) return null;

    return {
      userId,
      name: normalized.name || null,
      email: normalized.email || null,
    };
  }

  if (channel === "whatsapp") {
    const phoneNumber = getWhatsAppPhone(normalized);

    if (phoneNumber) {
      return {
        userId: normalized.id || null,
        name: normalized.name || null,
        phoneNumber,
        whatsappBsuid: null,
        whatsappUsername: null,
        birdContactId: null,
      };
    }

    if (normalized.whatsappBsuid) {
      return {
        userId: normalized.id || null,
        name: normalized.name || null,
        phoneNumber: null,
        whatsappBsuid: normalized.whatsappBsuid,
        whatsappUsername: normalized.whatsappUsername || null,
        birdContactId: null,
      };
    }

    if (normalized.birdContactId) {
      return {
        userId: normalized.id || null,
        name: normalized.name || null,
        phoneNumber: null,
        whatsappBsuid: null,
        whatsappUsername: null,
        birdContactId: normalized.birdContactId,
      };
    }
  }

  return null;
}

export function getRecipientSecondary(user, channel) {
  const normalized = normalizeUser(user);

  if (channel === "whatsapp") {
    return (
      getWhatsAppPhone(normalized) ||
      normalized.whatsappUsername ||
      normalized.whatsappBsuid ||
      normalized.birdContactId ||
      normalized.email ||
      "-"
    );
  }

  if (channel === "teams") {
    return (
      normalized.teamsFromId ||
      normalized.teamsAadObjectId ||
      normalized.email ||
      normalized.id ||
      "-"
    );
  }

  return normalized.email || "-";
}

export function normalizeRecipientForChannel(recipient, channel) {
  if (typeof recipient === "string" || typeof recipient === "number") {
    const value = cleanText(recipient);

    if (!value) return null;

    if (channel === "teams") {
      return {
        userId: value,
      };
    }

    if (looksLikeWhatsappBsuid(value)) {
      return {
        userId: null,
        name: null,
        phoneNumber: null,
        whatsappBsuid: value,
        whatsappUsername: null,
        birdContactId: null,
      };
    }

    return {
      userId: null,
      name: null,
      phoneNumber: value,
      whatsappBsuid: null,
      whatsappUsername: null,
      birdContactId: null,
    };
  }

  if (!recipient || typeof recipient !== "object") return null;

  if (channel === "teams") {
    const userId =
      cleanText(recipient.userId) ||
      cleanText(recipient.user_id) ||
      cleanText(recipient.id) ||
      cleanText(recipient.recipient);

    if (!userId) return null;

    return {
      userId,
      name: cleanText(recipient.name) || null,
      email: cleanText(recipient.email) || null,
    };
  }

  const recipientValue = cleanText(recipient.recipient);
  const toValue = cleanText(recipient.to);

  const phoneNumber =
    cleanText(recipient.phoneNumber) ||
    cleanText(recipient.phone_number) ||
    cleanText(recipient.phone) ||
    (!looksLikeWhatsappBsuid(toValue) ? toValue : "") ||
    (!looksLikeWhatsappBsuid(recipientValue) ? recipientValue : "");

  const whatsappBsuid =
    cleanText(recipient.whatsappBsuid) ||
    cleanText(recipient.whatsapp_bsuid) ||
    cleanText(recipient.whatsappPsuid) ||
    (looksLikeWhatsappBsuid(recipientValue) ? recipientValue : "") ||
    (looksLikeWhatsappBsuid(toValue) ? toValue : "");

  const birdContactId =
    cleanText(recipient.birdContactId) || cleanText(recipient.bird_contact_id);

  const userId =
    cleanText(recipient.userId) ||
    cleanText(recipient.user_id) ||
    cleanText(recipient.id);

  if (!phoneNumber && !whatsappBsuid && !birdContactId && !userId) {
    return null;
  }

  return {
    userId: userId || null,
    name: cleanText(recipient.name) || null,
    phoneNumber: phoneNumber || null,

    // Phone first. Fallback IDs only remain when no phone exists.
    whatsappBsuid: phoneNumber ? null : whatsappBsuid || null,
    whatsappUsername: phoneNumber
      ? null
      : cleanText(recipient.whatsappUsername) ||
        cleanText(recipient.whatsapp_username) ||
        null,
    birdContactId: phoneNumber || whatsappBsuid ? null : birdContactId || null,
  };
}

export function getRecipientKey(recipient, channel) {
  const normalized = normalizeRecipientForChannel(recipient, channel);

  if (!normalized) return "";

  if (channel === "teams") {
    return cleanText(normalized.userId);
  }

  /*
   * O id do utilizador é a identidade: é o que o servidor guarda e valida.
   * Telefone, BSUID e Bird só servem quando não há id (agendas antigas).
   */
  return (
    cleanText(normalized.userId) ||
    cleanText(normalized.phoneNumber) ||
    cleanText(normalized.whatsappBsuid) ||
    cleanText(normalized.birdContactId)
  );
}

export function getRecipientKind(recipient, channel) {
  const normalized = normalizeRecipientForChannel(recipient, channel);

  if (!normalized) return "unknown";
  if (channel === "teams") return "teams";
  if (normalized.phoneNumber) return "phone";
  if (normalized.whatsappBsuid) return "bsuid";
  if (normalized.birdContactId) return "bird";

  return "unknown";
}

export function uniqueRecipients(recipients = [], channel = "whatsapp") {
  const seen = new Set();
  const out = [];

  for (const recipient of Array.isArray(recipients) ? recipients : []) {
    const normalized = normalizeRecipientForChannel(recipient, channel);
    const key = getRecipientKey(normalized, channel);

    if (!normalized || !key || seen.has(key)) continue;

    seen.add(key);
    out.push(normalized);
  }

  return out;
}

/**
 * Encontra o utilizador da organização a que corresponde um destinatário
 * guardado. Primeiro pela chave (o id do utilizador); só para agendas antigas,
 * sem id, recorre ao telefone, BSUID ou Bird.
 */
export function findCandidateForRecipient(
  recipient,
  candidates = [],
  channel = "whatsapp",
) {
  const normalized = normalizeRecipientForChannel(recipient, channel);
  const key = getRecipientKey(normalized, channel);

  if (!normalized || !key) return null;

  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const byKey = safeCandidates.find((candidate) => candidate?.key === key);

  if (byKey) return byKey;

  if (channel === "teams") return null;

  return (
    safeCandidates.find((candidate) => {
      const known = candidate?.payloadRecipient || {};

      const phone = cleanText(candidate?.phoneNumber || known.phoneNumber);
      const bsuid = cleanText(candidate?.whatsappBsuid || known.whatsappBsuid);
      const bird = cleanText(candidate?.birdContactId || known.birdContactId);

      return (
        (normalized.phoneNumber && phonesMatch(phone, normalized.phoneNumber)) ||
        (normalized.whatsappBsuid && bsuid === normalized.whatsappBsuid) ||
        (normalized.birdContactId && bird === normalized.birdContactId)
      );
    }) || null
  );
}

/**
 * Destinatários prontos a gravar: os que correspondem a um utilizador da
 * organização passam à sua forma com `userId`; os outros ficam como estão.
 */
export function canonicalizeRecipients(
  recipients = [],
  candidates = [],
  channel = "whatsapp",
) {
  return uniqueRecipients(
    (Array.isArray(recipients) ? recipients : []).map((recipient) => {
      const found = findCandidateForRecipient(recipient, candidates, channel);

      return found?.payloadRecipient || recipient;
    }),
    channel,
  );
}

/**
 * Entrada de lista para um destinatário que já não existe na organização.
 * Nunca mostra o id em bruto como se fosse um nome.
 */
export function buildUnresolvedEntry(
  recipient,
  channel = "whatsapp",
  unknownLabel = "Utilizador removido",
) {
  const normalized = normalizeRecipientForChannel(recipient, channel);
  const key = getRecipientKey(normalized, channel);

  if (!normalized || !key) return null;

  const name =
    cleanText(normalized.name) ||
    cleanText(normalized.phoneNumber) ||
    cleanText(normalized.whatsappUsername) ||
    cleanText(normalized.whatsappBsuid) ||
    cleanText(normalized.birdContactId) ||
    cleanText(normalized.email) ||
    unknownLabel;

  const secondary =
    cleanText(normalized.phoneNumber) ||
    cleanText(normalized.email) ||
    cleanText(normalized.whatsappUsername) ||
    cleanText(normalized.whatsappBsuid) ||
    cleanText(normalized.birdContactId) ||
    "-";

  return {
    id: key,
    key,
    name,
    recipient: normalized,
    payloadRecipient: normalized,
    secondary,
    kind: getRecipientKind(normalized, channel),
    unresolved: true,
  };
}

export function mapRecipientsToEntries(
  recipients = [],
  candidates = [],
  channel = "whatsapp",
  { unknownLabel } = {},
) {
  const safeRecipients = Array.isArray(recipients) ? recipients : [];

  return safeRecipients
    .map(
      (recipient) =>
        findCandidateForRecipient(recipient, candidates, channel) ||
        buildUnresolvedEntry(recipient, channel, unknownLabel),
    )
    .filter(Boolean);
}
