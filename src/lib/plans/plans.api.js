/* Chamadas HTTP dos planos, para os ecrãs. */

/** O plano e os limites da organização: `{ plan, limits, expiresAt, expired }`. */
export async function fetchPlanLimits(orgId) {
  const res = await fetch(`/api/plans/limits?orgId=${encodeURIComponent(orgId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Could not load plan limits");
  }

  return data;
}

/**
 * Mensagens usadas esta semana por cada colaborador:
 * `{ limit, resetsAt, usage: { [userId]: { whatsapp, teams } } }`.
 */
export async function fetchCollaboratorWeeklyUsage(orgId) {
  const res = await fetch(
    `/api/plans/collaborator-usage?orgId=${encodeURIComponent(orgId)}`,
    { cache: "no-store" },
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Could not load weekly usage");
  }

  return data;
}
