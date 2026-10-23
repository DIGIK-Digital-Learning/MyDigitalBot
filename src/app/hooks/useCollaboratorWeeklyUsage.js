"use client";

import { useEffect, useState } from "react";

import { fetchCollaboratorWeeklyUsage } from "@/lib/plans/plans.api";

const EMPTY = { limit: null, resetsAt: null, usage: {} };

/**
 * Mensagens que cada colaborador já usou esta semana, por canal, para a
 * página de Utilizadores. Se o pedido falhar, a coluna fica vazia: é só
 * informação, nada fica bloqueado por causa dela.
 */
export default function useCollaboratorWeeklyUsage(orgId) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!orgId) return undefined;

    let cancelled = false;

    fetchCollaboratorWeeklyUsage(orgId)
      .then((data) => {
        if (!cancelled) {
          setState({
            limit: data.limit ?? null,
            resetsAt: data.resetsAt ?? null,
            usage: data.usage ?? {},
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return state;
}
