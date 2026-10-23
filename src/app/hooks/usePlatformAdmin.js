"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_PLAN_CHANGED_EVENT,
  fetchAdminStatus,
} from "@/lib/admin/admin.api";

const NOT_ADMIN = { isAdmin: false, orgId: null, plan: null, trying: false };

/**
 * Se quem está a ver é administrador da plataforma (#208) e em que plano está
 * a organização dele. Quem decide é o servidor; isto só mostra ou esconde o
 * menu "Administração" e a faixa "Estás a experimentar o plano…".
 */
export default function usePlatformAdmin() {
  const [state, setState] = useState(NOT_ADMIN);

  useEffect(() => {
    let cancelled = false;

    const load = () =>
      fetchAdminStatus()
        .then((data) => {
          if (!cancelled) setState({ ...NOT_ADMIN, ...data });
        })
        .catch(() => {
          if (!cancelled) setState(NOT_ADMIN);
        });

    load();
    window.addEventListener(ADMIN_PLAN_CHANGED_EVENT, load);

    return () => {
      cancelled = true;
      window.removeEventListener(ADMIN_PLAN_CHANGED_EVENT, load);
    };
  }, []);

  return state;
}
