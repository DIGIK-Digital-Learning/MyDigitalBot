"use client";

import { useTranslations } from "next-intl";

import styles from "./Pagination.module.css";

/*
 * As páginas a mostrar: a primeira, a última e as vizinhas da atual, com "…"
 * onde há saltos. Ex.: 1 … 4 5 6 … 12.
 */
export function pageNumbers(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const result = [];
  for (const [index, n] of sorted.entries()) {
    if (index > 0 && n - sorted[index - 1] > 1) result.push("…");
    result.push(n);
  }
  return result;
}

/**
 * Paginação das listas (links, mensagens agendadas): "Página 1 de 3 · 48
 * links", os números das páginas, Anterior e Seguinte, e quantos por página.
 * `summary` é o texto do resumo, já traduzido pela página.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sizes = [10, 20, 50],
  summary,
}) {
  const translation = useTranslations();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav
      className={styles.pagination}
      aria-label={translation("Pagination.label")}
    >
      <span className={styles.summary}>{summary}</span>

      <div className={styles.controls}>
        <select
          className={styles.size}
          value={pageSize}
          aria-label={translation("Pagination.perPageLabel")}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {translation("Pagination.perPage", { count: size })}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={styles.step}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          {translation("Pagination.previous")}
        </button>

        {pageNumbers(page, totalPages).map((item, index) =>
          item === "…" ? (
            <span key={`gap-${index}`} className={styles.gap}>
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`${styles.number} ${item === page ? styles.current : ""}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          className={styles.step}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {translation("Pagination.next")}
        </button>
      </div>
    </nav>
  );
}
