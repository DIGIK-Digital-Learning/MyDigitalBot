/*
 * Regras dos limites dos planos que não leem nada: servem tanto ao servidor
 * (planLimits.js) como aos ecrãs. Ficam separadas porque planLimits.js lê a
 * base de dados com a chave de servidor e não pode ir para o browser.
 */

/**
 * Ainda cabe? `limit` null quer dizer sem limite. Ex.: "tem 19 assistentes,
 * pode criar mais 1?".
 */
export function hasRoomFor(limit, current, adding = 1) {
  if (limit === null || limit === undefined) return true;
  return current + adding <= limit;
}

/**
 * Limite para algo que já existia antes de o limite existir (#185).
 *
 * Quem já estava acima (por exemplo, instruções com 7.405 caracteres ou uma
 * coleção com 8 ficheiros) pode ficar como está ou diminuir, mas não crescer:
 * o máximo é o maior entre o limite do plano e o que já tinha. Assim ninguém
 * perde nada e o limite não fica com buracos. Ao criar, `current` é 0 e vale
 * o limite do plano. null quer dizer sem limite.
 */
export function limitKeepingCurrent(planLimit, current = 0) {
  if (planLimit === null || planLimit === undefined) return null;
  return Math.max(planLimit, current);
}
