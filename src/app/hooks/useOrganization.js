"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { applyThemeVariables } from "@/lib/helpers/theme.helpers";
import { useAuth } from "@/app/AuthContext";
import { fetchCurrentOrganization } from "@/lib/helpers/currentOrganization";

export default function useOrganization(user) {
  const { loading: authLoading } = useAuth();
  const [org, setOrg] = useState(null);
  const [fetching, setFetching] = useState(false);
  /* O utilizador para quem a organização já foi lida. */
  const [loadedFor, setLoadedFor] = useState(null);
  const supabase = useMemo(() => createClient(), []);

  const loadOrganization = useCallback(async () => {
    if (!user) {
      setOrg(null);
      setLoadedFor(null);
      return;
    }

    setFetching(true);
    const { data, error } = await fetchCurrentOrganization(
      supabase,
      user.id,
      "id, name, logo_url, theme, channel_id, waba_id, waba_namespace, teams_tenant_id, default_phone_country_code",
    );

    if (error) console.error("[useOrganization]", error.message);
    setOrg(data ?? null);
    setLoadedFor(user.id);
    setFetching(false);
  }, [supabase, user]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadOrganization();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [loadOrganization]);

  useEffect(() => {
    const refresh = () => loadOrganization();
    window.addEventListener("organization:updated", refresh);
    return () => window.removeEventListener("organization:updated", refresh);
  }, [loadOrganization]);

  useEffect(() => {
    applyThemeVariables(org?.theme);
  }, [org]);

  /*
   * Ainda a carregar enquanto a sessão não chegou, ou enquanto a organização
   * deste utilizador não foi lida. Antes, havia um instante (o utilizador
   * ainda por chegar, ou acabado de chegar) com loading false e org null, e
   * as páginas avisavam "Organização em falta" sem razão.
   */
  /*
   * Reler a organização já lida (depois de a editar nas Definições) não
   * volta a «a carregar»: as páginas por trás das permissões ficam onde
   * estão, com o que a pessoa estava a escrever (#247).
   */
  const loading =
    authLoading ||
    Boolean(user && loadedFor !== user.id) ||
    (fetching && !org);

  return { org, loading, refresh: loadOrganization };
}
