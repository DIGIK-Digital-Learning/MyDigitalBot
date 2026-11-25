"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "next-intl";

import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { accessAllows } from "@/lib/auth/permissions";
import {
  changeViewAs,
  fetchAccess,
} from "@/lib/organizations/organizations.api";

/*
 * O que quem tem a sessão pode fazer (#247), lido uma vez para toda a app.
 * O ecrã usa-o para pôr a cinzento o que não se pode usar (como os dias
 * passados do calendário) e para mostrar um aviso nas páginas que não se
 * podem ver. Quem decide é o servidor: isto só evita clicar para nada.
 *
 * Enquanto carrega, `can` diz que sim, para não piscar tudo a cinzento a
 * cada página; se alguém clicar nesse instante, o servidor recusa.
 */
const EMPTY = {
  loaded: false,
  isAdmin: false,
  typeKey: null,
  permissions: [],
  viewAs: null,
  viewAsName: null,
  canSwitch: false,
  viewAsTypes: [],
};

const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const translation = useTranslations("Permissions");
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const orgId = org?.id ?? null;
  const [state, setState] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;

    fetchAccess(orgId)
      .then((data) => {
        if (!cancelled) setState({ ...EMPTY, ...data, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, loaded: true });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const can = useCallback(
    (required) => !state.loaded || accessAllows(state, required),
    [state],
  );

  /*
   * Props para um controlo que pede `required`: `null` se pode, senão a
   * marca cinzenta e a razão ao passar o rato. O `disabled` fica no próprio
   * controlo (`disabled={… || !can(P.X)}`).
   */
  const lock = useCallback(
    (required) =>
      can(required)
        ? null
        : {
            "data-permission-denied": "",
            "aria-disabled": true,
            title: translation("denied"),
          },
    [can, translation],
  );

  const chooseViewAs = useCallback(
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

  const value = useMemo(
    () => ({
      ...state,
      /* Já se sabe o que a pessoa pode ver (as páginas esperam por isto). */
      ready: !orgLoading && (!orgId || state.loaded),
      busy,
      can,
      lock,
      chooseViewAs,
    }),
    [state, orgLoading, orgId, busy, can, lock, chooseViewAs],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

/* Fora do provider (testes, páginas públicas), tudo é permitido. */
const ALLOW_ALL = {
  ...EMPTY,
  ready: true,
  busy: false,
  can: () => true,
  lock: () => null,
  chooseViewAs: async () => {},
};

export default function usePermissions() {
  return useContext(PermissionsContext) ?? ALLOW_ALL;
}
