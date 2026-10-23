/* Chamadas HTTP da organização, para os ecrãs. */

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
