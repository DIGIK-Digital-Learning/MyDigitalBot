"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import NewBadge from "@/app/components/NewBadge/NewBadge";
import Pagination from "@/app/components/Pagination/Pagination";

import styles from "../tracked-links.module.css";

/**
 * Links criados (#189): os que contam para os 100 do plano, com o ✕ para
 * eliminar e a etiqueta "Novo" nos criados desde a última visita. Por
 * páginas, para a lista não crescer sem fim.
 */
export default function SavedLinksSection({ links, loading, isNew, onDelete }) {
  const translation = useTranslations();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const totalPages = Math.max(1, Math.ceil(links.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = links.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <section className={styles.savedCard}>
      <div>
        <h2 className={styles.savedTitle}>
          {translation("TrackedLinks.saved.title")}
        </h2>
        <p className={styles.subtitle}>
          {translation("TrackedLinks.saved.description")}
        </p>
      </div>

      {loading && !links.length ? (
        <div className={styles.savedEmpty}>
          {translation("TrackedLinks.loading")}
        </div>
      ) : null}

      {!loading && !links.length ? (
        <div className={styles.savedEmpty}>
          {translation("TrackedLinks.saved.empty")}
        </div>
      ) : null}

      {visible.length ? (
        <ul className={styles.savedList}>
          {visible.map((link) => (
            <li key={link.id} className={styles.savedItem}>
              <div className={styles.savedText}>
                <strong>
                  {link.label}
                  {isNew(link.createdAt) ? <NewBadge /> : null}
                </strong>
                <span className={styles.savedUrl} title={link.destinationUrl}>
                  {link.destinationUrl}
                </span>
              </div>

              <button
                type="button"
                className={styles.savedDelete}
                onClick={() => onDelete(link)}
                aria-label={translation("Broadcast.linkLibrary.delete", {
                  label: link.label,
                })}
                title={translation("Broadcast.linkLibrary.delete", {
                  label: link.label,
                })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {links.length > pageSize ? (
        <Pagination
          page={currentPage}
          pageSize={pageSize}
          total={links.length}
          sizes={[8, 16, 32]}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          summary={translation("TrackedLinks.pagination", {
            page: currentPage,
            pages: totalPages,
            total: links.length,
          })}
        />
      ) : null}
    </section>
  );
}
