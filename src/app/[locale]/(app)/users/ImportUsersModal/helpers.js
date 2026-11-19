function cleanValue(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeHeader(key) {
  return cleanValue(key)
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeHeaders(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      normalizeHeader(key),
      cleanValue(value),
    ]),
  );
}

function getValue(row, keys = []) {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const value = row[normalizedKey];

    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function onlyDigits(value) {
  return cleanValue(value).replace(/\D/g, "");
}

function normalizeCountryCode(value) {
  const code = cleanValue(value).replace(/[^\d+]/g, "");

  if (!code) return "";
  return code.startsWith("+") ? code : `+${code}`;
}

function parseTags(value) {
  const raw = cleanValue(value);

  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((tag) => cleanValue(tag))
        .filter(Boolean),
    ),
  ];
}

function splitPhone({
  rawPhoneNumber,
  rawPhoneCountryCode,
  rawPhoneNational,
  defaultPhoneCode = "+351",
}) {
  const phoneNumber = cleanValue(rawPhoneNumber).replace(/[^\d+]/g, "");
  const explicitCode = normalizeCountryCode(rawPhoneCountryCode);
  const defaultCode = normalizeCountryCode(defaultPhoneCode);
  const nationalFromCsv = onlyDigits(rawPhoneNational);

  if (phoneNumber) {
    if (phoneNumber.startsWith("+")) {
      const detectedCode =
        explicitCode ||
        (defaultCode && phoneNumber.startsWith(defaultCode) ? defaultCode : "");

      return {
        phoneNumber,
        phoneCountryCode: detectedCode || null,
        phoneNational: detectedCode
          ? onlyDigits(phoneNumber.slice(detectedCode.length)) || null
          : onlyDigits(phoneNumber.slice(1)) || null,
      };
    }

    const national = onlyDigits(phoneNumber);
    const code = explicitCode || defaultCode;

    return {
      phoneNumber: code ? `${code}${national}` : national,
      phoneCountryCode: code || null,
      phoneNational: national || null,
    };
  }

  if (nationalFromCsv) {
    const code = explicitCode || defaultCode;

    return {
      phoneNumber: code ? `${code}${nationalFromCsv}` : nationalFromCsv,
      phoneCountryCode: code || null,
      phoneNational: nationalFromCsv,
    };
  }

  return {
    phoneNumber: null,
    phoneCountryCode: null,
    phoneNational: null,
  };
}

export default function mapCsvRow(
  row,
  defaultPhoneCode = "+351",
  forcedAssistantId = null,
) {
  const normalized = normalizeHeaders(row);

  const name = getValue(normalized, ["name", "display_name", "full_name"]);

  const email = getValue(normalized, [
    "email",
    "user_name",
    "username",
  ]).toLowerCase();

  const rawPhoneNumber = getValue(normalized, [
    "phone_number",
    "phone",
    "mobile",
    "mobile_phone",
  ]);

  const rawPhoneCountryCode = getValue(normalized, [
    "phone_country_code",
    "country_code",
  ]);

  const rawPhoneNational = getValue(normalized, [
    "phone_national",
    "national_phone",
    "national_number",
  ]);

  const phone = splitPhone({
    rawPhoneNumber,
    rawPhoneCountryCode,
    rawPhoneNational,
    defaultPhoneCode,
  });

  const teamsAadObjectId = getValue(normalized, [
    "teams_aad_object_id",
    "teams_aad",
    "aad_object_id",
    "user_id",
  ]);

  const teamsFromId = getValue(normalized, ["teams_from_id"]);

  // Vários assistentes na mesma célula separam-se por ";" (ex.: "3;7").
  // O primeiro fica como assistente ativo.
  const assistantIdFromCsv = getValue(normalized, [
    "assistant_id",
    "assistantid",
    "assistant_ids",
    "assistants",
  ]);

  const assistantPositionFromCsv = getValue(normalized, [
    "assistant_position",
    "assistantposition",
    "assistant_positions",
  ]);

  const tags = parseTags(
    // #283: na app as tags chamam-se «Grupos»; os CSV antigos com «tags»
    // continuam a funcionar.
    getValue(normalized, [
      "tags",
      "tag",
      "user_tags",
      "tag_names",
      "grupos",
      "grupo",
      "groups",
      "group",
    ]),
  );

  return {
    name,
    email: email || null,
    phoneCountryCode: phone.phoneCountryCode,
    phoneNational: phone.phoneNational,
    phoneNumber: phone.phoneNumber,
    teamsAadObjectId: teamsAadObjectId || null,
    teamsFromId: teamsFromId || null,
    assistantId: forcedAssistantId || assistantIdFromCsv || null,
    assistantPosition: assistantPositionFromCsv || null,
    tags,
  };
}
