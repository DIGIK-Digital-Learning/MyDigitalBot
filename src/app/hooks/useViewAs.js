"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import {
  changeViewAs,
  fetchViewAs,
} from "@/lib/organizations/organizations.api";

const NONE = { canSwitch: false, viewAs: null, types: [] };

/**
 * «Ver como» (#247): se quem está a ver é Administrador e pode ver a app
 * como outro tipo, e como está a ver agora. Quem decide é o servidor; isto
 * só mostra o seletor e a faixa. `choose(typeKey)` troca e recarrega a
 * página, para tudo voltar a pedir os dados com as permissões novas.
 */
export default function useViewAs() {
  const { user } = useAuth();
  const { org } = useOrganization(user);
  const [state, setState] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const orgId = org?.id ?? null;

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;

    fetchViewAs(orgId)
      .then((data) => {
        if (!cancelled) setState({ ...NONE, ...data });
      })
      .catch(() => {
        if (!cancelled) setState(NONE);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const choose = useCallback(
    async (typeKey) => {
      if (!orgId) return;
      setBusy(true);
      try {
        await changeViewAs(orgId, typeKey || null);
        window.location.reload();
      } finally {
        setBusy(false);
      }
    },
    [orgId],
  );

  return { ...state, busy, choose };
}
