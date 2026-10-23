import { lisbonParts, lisbonWallTime } from "./dailySends";

/*
 * A semana das mensagens do colaborador: começa às 00:00 de segunda-feira em
 * Lisboa e acaba às 00:00 da segunda seguinte. Usa as mesmas contas de
 * Lisboa do limite diário (#188), por causa da hora de verão.
 */

/* Início da semana em que `now` está: a última segunda às 00:00 de Lisboa. */
export function weeklyMessagesWeekStart(now = new Date()) {
  const p = lisbonParts(now);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day));

  /* getUTCDay: 0 = domingo, 1 = segunda… */
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);

  return lisbonWallTime(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    0,
    0,
  );
}

/* Quando a contagem volta a 0: a próxima segunda às 00:00 de Lisboa. */
export function weeklyMessagesResetAt(now = new Date()) {
  const start = weeklyMessagesWeekStart(now);
  /* +8 dias cai sempre na semana seguinte, mesmo com mudança de hora. */
  return weeklyMessagesWeekStart(
    new Date(start.getTime() + 8 * 24 * 60 * 60 * 1000),
  );
}
