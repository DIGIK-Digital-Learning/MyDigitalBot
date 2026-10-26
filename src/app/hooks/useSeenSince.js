"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* A hora da última visita a uma página, guardada neste browser. */
function readSeenAt(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const time = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(time) ? null : new Date(time);
  } catch {
    return null;
  }
}

function writeSeenAt(key) {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    /* Sem acesso ao armazenamento (modo privado): fica sem "Novo". */
  }
}

/**
 * Etiqueta "Novo": diz se uma data é posterior à última visita a esta página,
 * neste browser. A hora da visita só é guardada ao sair da página, para os
 * "Novo" continuarem à vista enquanto se está nela. Na primeira visita (sem
 * nada guardado) nada é novo, senão tudo apareceria como novo.
 *
 * `key` identifica a página (por exemplo "seen.scheduled") e `scope` a
 * organização, para contas diferentes no mesmo browser não se misturarem.
 */
export default function useSeenSince(key, scope) {
  const storageKey = scope ? `${key}:${scope}` : null;
  const [seenAt, setSeenAt] = useState(null);
  /*
   * Lido uma só vez: em desenvolvimento o React monta a página duas vezes e a
   * segunda leitura já veria a hora gravada pela primeira saída.
   */
  const previous = useRef({ key: null, value: null });

  useEffect(() => {
    if (!storageKey) return undefined;

    if (previous.current.key !== storageKey) {
      previous.current = { key: storageKey, value: readSeenAt(storageKey) };
    }
    setSeenAt(previous.current.value);

    const save = () => writeSeenAt(storageKey);
    window.addEventListener("pagehide", save);

    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [storageKey]);

  return useCallback(
    (value) => {
      if (!seenAt || !value) return false;
      const time = new Date(value).getTime();
      return !Number.isNaN(time) && time > seenAt.getTime();
    },
    [seenAt],
  );
}
