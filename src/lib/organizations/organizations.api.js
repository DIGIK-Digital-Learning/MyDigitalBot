/* Chamadas HTTP da organização, para os ecrãs. */

/** «Ver como» (#247): `{ canSwitch, viewAs, types }`. */
export async function fetchViewAs(orgId) {
  const response = await fetch(
    `/api/organizations/view-as?orgId=${encodeURIComponent(orgId)}`,
  );
  if (!response.ok) throw new Error(`view-as ${response.status}`);
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
