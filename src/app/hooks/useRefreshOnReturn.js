"use client";

import { useEffect, useRef } from "react";

/* Trocar de separador só por uns segundos não volta a pedir nada. */
export const MIN_AWAY_MS = 30_000;

/**
 * #236: as páginas deixaram de ter o botão "Atualizar". Ao entrar, ao mudar um
 * filtro e depois de uma ação os dados já voltavam a ser pedidos; o que o
 * botão ainda fazia era mostrar o que mudou fora da página (uma agendada que
 * saiu, uma automação que correu). Isso passa a acontecer sozinho: quando a
 * pessoa volta ao separador da app depois de pelo menos `minAwayMs` fora,
 * `refresh()` corre (em silêncio, sem o ecrã piscar: cabe a quem chama).
 */
export default function useRefreshOnReturn(
  refresh,
  { minAwayMs = MIN_AWAY_MS } = {},
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let hiddenAt = null;

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= minAwayMs) refreshRef.current?.();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [minAwayMs]);
}
