"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchPlanLimits } from "@/lib/plans/plans.api";

const EMPTY = { plan: null, limits: null, usage: null, dailySendsResetAt: null };

/**
 * Os limites do plano da organização e quanto já está gasto, para contadores
 * e avisos no ecrã ("6 / 20" automações, "2 / 100" agendadas, "3 / 10"
 * envios de hoje em cada canal, que voltam a 0 em `dailySendsResetAt`).
 *
 * Enquanto não chegam (ou se o pedido falhar), `limits` e `usage` são null e
 * o ecrã não bloqueia nada: quem decide é o servidor, que recusa na mesma o
 * que passar do limite. Assim uma falha aqui nunca deixa a pessoa presa.
 *
 * `reload()` volta a pedir os números, para o contador acompanhar depois de
 * criar, apagar ou agendar.
 */
export default function usePlanLimits(orgId) {
  const [state, setState] = useState(EMPTY);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!orgId) return undefined;

    let cancelled = false;

    fetchPlanLimits(orgId)
      .then((data) => {
        if (!cancelled) {
          setState({
            plan: data.plan ?? null,
            limits: data.limits ?? null,
            usage: data.usage ?? null,
            dailySendsResetAt: data.dailySendsResetAt ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, reload };
}
