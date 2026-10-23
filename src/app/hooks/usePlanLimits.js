"use client";

import { useEffect, useState } from "react";

import { fetchPlanLimits } from "@/lib/plans/plans.api";

/**
 * Os limites do plano da organização, para contadores e avisos no ecrã.
 *
 * Enquanto não chegam (ou se o pedido falhar), `limits` é null e o ecrã não
 * bloqueia nada: quem decide é o servidor, que recusa na mesma o que passar
 * do limite. Assim uma falha aqui nunca deixa a pessoa presa.
 */
export default function usePlanLimits(orgId) {
  const [state, setState] = useState({ plan: null, limits: null });

  useEffect(() => {
    if (!orgId) return undefined;

    let cancelled = false;

    fetchPlanLimits(orgId)
      .then((data) => {
        if (!cancelled) setState({ plan: data.plan, limits: data.limits });
      })
      .catch(() => {
        if (!cancelled) setState({ plan: null, limits: null });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}
