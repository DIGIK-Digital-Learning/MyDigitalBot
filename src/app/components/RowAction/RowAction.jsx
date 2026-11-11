"use client";

import Link from "next/link";
import { Eye, Pencil, Trash2, X } from "lucide-react";

import styles from "./RowAction.module.css";

/* Cada função tem sempre o mesmo ícone (#238). */
const ICONS = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
  remove: X,
};

/**
 * Botão de ação de uma linha ou de um detalhe (#238): Ver, Editar, Eliminar,
 * Remover… com o mesmo aspeto e o mesmo texto em toda a app.
 *
 * - `kind`: "view" | "edit" | "delete" | "remove", ou outro com `icon`.
 * - `danger`: vermelho, como "Eliminar" (para cancelar ou parar).
 * - `compact`: só o ícone (o texto fica no tooltip e para leitores de ecrã),
 *   para listas pequenas onde o texto não cabe.
 *
 * O clique não chega à linha: um "Editar" dentro de uma linha clicável não
 * abre também o "Ver".
 */
export default function RowAction({
  kind,
  label,
  icon,
  onClick,
  compact = false,
  danger: dangerProp = false,
  disabled = false,
  title,
  className = "",
  ...rest
}) {
  const Icon = icon ?? ICONS[kind];
  /* Vermelho para o que não se desfaz: eliminar, cancelar, parar. */
  const danger = kind === "delete" || dangerProp;

  return (
    <button
      type="button"
      className={[
        styles.action,
        danger ? styles.danger : "",
        compact ? styles.compact : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      disabled={disabled}
      title={title ?? label}
      aria-label={compact ? label : undefined}
      data-row-action={kind}
      {...rest}
    >
      {Icon ? <Icon size={15} aria-hidden /> : null}
      <span className={styles.label}>{label}</span>
    </button>
  );
}

/*
 * O mesmo aspeto, mas um link verdadeiro: para um "Ver" que muda de página,
 * continua a dar para abrir noutro separador.
 */
export function RowActionLink({
  kind = "view",
  label,
  icon,
  href,
  className = "",
  ...rest
}) {
  const Icon = icon ?? ICONS[kind];

  return (
    <Link
      href={href}
      className={`${styles.action} ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      data-row-action={kind}
      {...rest}
    >
      {Icon ? <Icon size={15} aria-hidden /> : null}
      <span className={styles.label}>{label}</span>
    </Link>
  );
}

/* As ações de uma linha, lado a lado e sempre visíveis. */
export function RowActions({ children, label, className = "" }) {
  return (
    <div
      className={`${styles.group} ${className}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
