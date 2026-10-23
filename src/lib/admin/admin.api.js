/* Chamadas HTTP da área de administração dos planos (#208), para os ecrãs. */

async function request(url, init) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data?.error || "Request failed");
    error.status = res.status;
    throw error;
  }

  return data;
}

/** `{ isAdmin, orgId, plan, trying }`: para os clientes só `{ isAdmin: false }`. */
export function fetchAdminStatus() {
  return request("/api/admin/me");
}

/** `{ plans, organizations, internalPlanId, adminOrgId }`. */
export function fetchAdminOverview() {
  return request("/api/admin/overview");
}

export function changeOrganizationPlan(orgId, planId) {
  return request(`/api/admin/organizations/${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
}

/** `body` é `{ limits: { users: 100, … }, durationDays }`; null = sem limite. */
export function updatePlanLimits(planId, body) {
  return request(`/api/admin/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* O menu e a faixa voltam a perguntar quando o plano muda nesta página. */
export const ADMIN_PLAN_CHANGED_EVENT = "mdb:admin-plan-changed";

export function announceAdminPlanChanged() {
  window.dispatchEvent(new Event(ADMIN_PLAN_CHANGED_EVENT));
}
