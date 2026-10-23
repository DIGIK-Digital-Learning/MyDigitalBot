"use client";

import { useLocale, useTranslations } from "next-intl";

import styles from "./CharCounter.module.css";

/**
 * Contador de caracteres de um campo com limite ("3.017 / 5.000"). Fica
 * vermelho acima do limite. Quando o limite é maior do que o do plano (algo
 * criado antes de o limite existir), explica porquê.
 *
 * Sem `limit` (sem limite, ou limites ainda por carregar) não mostra nada.
 */
export default function CharCounter({ length, limit, planLimit = limit }) {
  const translation = useTranslations("Plans.counter");
  const locale = useLocale();

  if (limit === null || limit === undefined) return null;

  const format = (n) => Number(n).toLocaleString(locale);
  const over = length > limit;

  return (
    <div className={styles.counterRow}>
      {limit > planLimit && (
        <span className={styles.note}>
          {translation("olderThanLimit", { limit: format(planLimit) })}
        </span>
      )}
      <span
        className={`${styles.counter} ${over ? styles.over : ""}`}
        aria-live="polite"
      >
        {format(length)} / {format(limit)}
      </span>
    </div>
  );
}
