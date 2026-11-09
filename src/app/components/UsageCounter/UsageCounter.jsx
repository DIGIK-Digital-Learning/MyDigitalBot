"use client";

import { useLocale } from "next-intl";

import styles from "./UsageCounter.module.css";

/**
 * Quanto do limite do plano já está gasto ("6 / 20"). Fica vermelho quando
 * chega ao limite, porque aí já não cabe mais nenhum. `hint` aparece ao
 * passar o rato (ex.: o que conta para as mensagens agendadas).
 *
 * Sem limite no plano, ou com os números ainda por carregar, não mostra nada.
 */
export default function UsageCounter({ used, limit, label, hint }) {
  const locale = useLocale();

  if (limit === null || limit === undefined) return null;
  if (used === null || used === undefined) return null;

  const format = (n) => Number(n).toLocaleString(locale);
  const full = used >= limit;

  return (
    <span
      className={`${styles.usage} ${full ? styles.full : ""}`}
      title={hint}
      aria-label={label ? `${label}: ${used} / ${limit}` : undefined}
    >
      {format(used)} / {format(limit)}
    </span>
  );
}
