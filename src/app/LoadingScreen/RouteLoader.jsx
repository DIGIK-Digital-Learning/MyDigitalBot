"use client";

import { useEffect } from "react";
import { useGlobalLoader } from "./GlobalLoaderContext";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * Ao mudar de página, cada rota mostra o seu skeleton (loading.jsx, #272),
 * por isso o spinner global já não aparece nos cliques em links. Fica só
 * para ações em curso (ex.: guardar um assistente) e para depois do login;
 * aqui fecha-se sempre que a página muda, para nunca ficar preso.
 */
export default function RouteLoader() {
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const { stopLoading } = useGlobalLoader();

  const routeKey = `${pathName}?${searchParams.toString()}`;

  useEffect(() => {
    stopLoading();
  }, [routeKey, stopLoading]);

  return null;
}
