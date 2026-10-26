"use client";

import { useCallback, useEffect, useState } from "react";

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

/*
 * As visitas em curso, por página: a hora da visita anterior, lida uma só vez.
 * Uma página pode ser montada duas vezes seguidas (o React em desenvolvimento,
 * ou quando a organização acaba de carregar); a segunda montagem continua a
 * mesma visita e não pode ler a hora que a primeira acabou de gravar.
 */
const visits = new Map();

/* Quanto tempo uma página desmontada ainda conta como a mesma visita. */
const SAME_VISIT_MS = 1500;

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

  useEffect(() => {
    if (!storageKey) return undefined;

    let visit = visits.get(storageKey);
    if (visit) {
      clearTimeout(visit.timer);
    } else {
      visit = { previous: readSeenAt(storageKey), timer: null };
      visits.set(storageKey, visit);
    }
    setSeenAt(visit.previous);

    const endVisit = () => {
      writeSeenAt(storageKey);
      visits.delete(storageKey);
    };
    window.addEventListener("pagehide", endVisit);

    return () => {
      window.removeEventListener("pagehide", endVisit);
      /* Só é o fim da visita se a página não voltar a montar logo a seguir. */
      visit.timer = setTimeout(endVisit, SAME_VISIT_MS);
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
