"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { applyThemeVariables } from "@/lib/helpers/theme.helpers";
import { useAuth } from "@/app/AuthContext";

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
    const { data, error } = await supabase
      .from("organization")
      .select(
        "id, name, logo_url, theme, channel_id, waba_id, waba_namespace, teams_tenant_id, default_phone_country_code",
      )
      .eq("owner_user_id", user.id)
      .single();

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
  const loading =
    authLoading || fetching || Boolean(user && loadedFor !== user.id);

  return { org, loading, refresh: loadOrganization };
}
