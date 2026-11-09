import { applyPeriod } from "@/lib/helpers/analytics.helpers";
import { countRows } from "./analyticsBase.repo";

/**
 * Vai buscar métricas de pending outreach da organização.
 *
 * Pending outreach representa contactos/mensagens que ainda estão
 * pendentes, em fila ou ativos para algum tipo de contacto futuro.
 *
 * Devolve:
 * - total de registos;
 * - registos ainda ativos.
 */
export async function getPendingOutreachMetrics(orgId, periodStart) {
  /**
   * Executa as contagens em paralelo.
   */
  const [total, active] = await Promise.all([
    /**
     * Conta todos os registos de pending_outreach da organização
     * dentro do período selecionado.
     */
    countRows("pending_outreach", (q) =>
      applyPeriod(q.eq("org_id", orgId), periodStart)
    ),

    /**
     * Conta apenas os registos considerados ativos.
     *
     * Estados considerados ativos:
     * - pending
     * - queued
     * - active
     */
    countRows("pending_outreach", (q) =>
      applyPeriod(
        q
          .eq("org_id", orgId)
          .in("status", ["pending", "queued", "active"])
          .gt("expires_at", new Date().toISOString()),
        periodStart
      )
    ),
  ]);

  /**
   * Devolve as métricas no formato usado pela dashboard.
   */
  return {
    total,
    active,
  };
}
