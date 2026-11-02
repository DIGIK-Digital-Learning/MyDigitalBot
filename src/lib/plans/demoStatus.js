/* Regras puras da Demo de 7 dias (#209), para os ecrãs. */

const DAY_MS = 24 * 60 * 60 * 1000;

/* A partir de quantos dias em falta a faixa passa a laranja. */
export const DEMO_WARNING_DAYS = 2;

/**
 * Em que ponto está um plano com prazo: `{ stage, daysLeft }`, ou null num
 * plano sem prazo. `stage` é "active", "warning" (faltam 2 dias ou menos) ou
 * "ended". Os dias arredondam para cima: com 1 dia e meio, faltam 2.
 *
 * `expired` é o que o servidor diz; manda sobre o relógio do computador.
 */
export function demoStatus({ expiresAt, expired = false }, now = new Date()) {
  if (!expiresAt) return null;

  const msLeft = new Date(expiresAt).getTime() - now.getTime();
  if (expired || msLeft <= 0) return { stage: "ended", daysLeft: 0 };

  const daysLeft = Math.ceil(msLeft / DAY_MS);

  return {
    stage: daysLeft <= DEMO_WARNING_DAYS ? "warning" : "active",
    daysLeft,
  };
}
