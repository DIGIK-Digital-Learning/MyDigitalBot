"use client";

import { useTranslations } from "next-intl";

import styles from "./NewBadge.module.css";

/* Etiqueta "Novo" para o que foi criado desde a última visita à página. */
export default function NewBadge() {
  const translation = useTranslations();

  return <span className={styles.badge}>{translation("Common.new")}</span>;
}
