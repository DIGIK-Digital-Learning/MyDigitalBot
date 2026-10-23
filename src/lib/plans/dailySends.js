/*
 * O dia dos envios do administrador (#188): começa às 00:01 de Lisboa e
 * acaba às 00:01 do dia seguinte. A hora de Lisboa muda no verão (UTC+1) e
 * no inverno (UTC+0), por isso as contas usam o fuso e não um desvio fixo.
 */

export const DAILY_SENDS_TIME_ZONE = "Europe/Lisbon";
export const DAILY_RESET_MINUTE = 1;

const MINUTE_MS = 60 * 1000;

/* Data e hora de Lisboa num instante, em números. */
function lisbonParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DAILY_SENDS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/* Quanto Lisboa está à frente de UTC nesse instante, em milissegundos. */
function lisbonOffsetMs(date) {
  const p = lisbonParts(date);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/* O instante em que os relógios de Lisboa marcam esta data e hora. */
function lisbonWallTime(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - lisbonOffsetMs(new Date(guess));
  /* Perto da mudança de hora o desvio pode ser outro: confirma uma vez. */
  return new Date(guess - lisbonOffsetMs(new Date(first)));
}

/**
 * Início do dia de envios em que `now` está: as 00:01 de Lisboa de hoje, ou
 * de ontem se ainda não passou da 00:01.
 */
export function dailySendsDayStart(now = new Date()) {
  const p = lisbonParts(now);
  const beforeReset = p.hour === 0 && p.minute < DAILY_RESET_MINUTE;

  const day = new Date(Date.UTC(p.year, p.month - 1, p.day));
  if (beforeReset) day.setUTCDate(day.getUTCDate() - 1);

  return lisbonWallTime(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    0,
    DAILY_RESET_MINUTE,
  );
}

/* Quando o contador volta a 0: as 00:01 de Lisboa do dia seguinte. */
export function dailySendsResetAt(now = new Date()) {
  const start = dailySendsDayStart(now);
  /* +25h cai sempre no dia seguinte, mesmo num dia de 23h ou de 25h. */
  return dailySendsDayStart(new Date(start.getTime() + 25 * 60 * MINUTE_MS));
}
