/* Chamadas HTTP da organização, para os ecrãs. */

/**
 * O que quem tem a sessão pode fazer (#247):
 * `{ typeKey, isAdmin, permissions, viewAs, canSwitch, viewAsTypes }`.
 */
export async function fetchAccess(orgId) {
  const response = await fetch(
    `/api/organizations/access?orgId=${encodeURIComponent(orgId)}`,
  );
  if (!response.ok) throw new Error(`access ${response.status}`);
  return response.json();
}

/** Troca o tipo com que o Administrador vê a app; null volta ao normal. */
export async function changeViewAs(orgId, typeKey) {
  const response = await fetch("/api/organizations/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, typeKey }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `view-as ${response.status}`);
  return data;
}

/**
 * Guarda a língua do topo do site na organização. Não falha o ecrã: se não
 * gravar, os avisos aos colaboradores continuam na língua anterior.
 */
export async function saveOrganizationLocale(orgId, locale) {
  try {
    await fetch("/api/organizations/locale", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, locale }),
      /* O clique muda de página: o pedido tem de sobreviver à navegação. */
      keepalive: true,
    });
  } catch {
    /* Sem rede: fica para o próximo clique. */
  }
}

/*
 * Definições → Equipa (#247). Os erros trazem o código do servidor em
 * `error.code` (TEAM_LIMIT_REACHED, IN_OTHER_ORGANIZATION…) para o ecrã
 * mostrar a frase certa.
 */
async function teamRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `team ${response.status}`);
    error.code = data.error || null;
    throw error;
  }
  return data;
}

export function fetchTeam(orgId) {
  return teamRequest(`/api/organizations/team?orgId=${encodeURIComponent(orgId)}`);
}

export function inviteTeamMember(orgId, { email, typeId, locale }) {
  return teamRequest("/api/organizations/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, email, typeId, locale }),
  });
}

export function resendTeamInvite(orgId, memberId, locale) {
  return teamRequest("/api/organizations/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, action: "resend", memberId, locale }),
  });
}

export function changeTeamMemberType(orgId, memberId, typeId) {
  return teamRequest("/api/organizations/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, memberId, typeId }),
  });
}

/* Definições → Tipos de utilizador (#247, parte 4/4). */
export function fetchUserTypes(orgId) {
  return teamRequest(`/api/organizations/user-types?orgId=${encodeURIComponent(orgId)}`);
}

export function saveUserType(orgId, { typeId = null, name, permissions }) {
  return teamRequest("/api/organizations/user-types", {
    method: typeId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, typeId, name, permissions }),
  });
}

export function deleteUserType(orgId, typeId) {
  return teamRequest(
    `/api/organizations/user-types?orgId=${encodeURIComponent(orgId)}&typeId=${encodeURIComponent(typeId)}`,
    { method: "DELETE" },
  );
}

export function removeTeamMember(orgId, memberId) {
  return teamRequest(
    `/api/organizations/team?orgId=${encodeURIComponent(orgId)}&memberId=${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}
