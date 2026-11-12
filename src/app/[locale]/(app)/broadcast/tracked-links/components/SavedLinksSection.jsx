"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import NewBadge from "@/app/components/NewBadge/NewBadge";
import Pagination from "@/app/components/Pagination/Pagination";
import RowAction from "@/app/components/RowAction/RowAction";

import styles from "../tracked-links.module.css";

/**
 * Links criados (#189): os que contam para os 100 do plano, com o 🗑 para
 * eliminar e a etiqueta "Novo" nos criados desde a última visita. Por
 * páginas, para a lista não crescer sem fim.
 *
 * "Criar link" abre a janela para criar um link sem enviar uma mensagem
 * (`onCreate`). No limite do plano (`full`) fica desativado e diz porquê.
 */
export default function SavedLinksSection({
  links,
  loading,
  isNew,
  onDelete,
  onCreate = null,
  full = false,
  limit = null,
}) {
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
      <div className={styles.savedHead}>
        <div>
          <h2 className={styles.savedTitle}>
            {translation("TrackedLinks.saved.title")}
          </h2>
          <p className={styles.subtitle}>
            {translation("TrackedLinks.saved.description")}
          </p>
        </div>

        {onCreate ? (
          <button
            type="button"
            className={styles.createButton}
            onClick={onCreate}
            disabled={full}
          >
            <Plus size={16} aria-hidden />
            {translation("TrackedLinks.create.button")}
          </button>
        ) : null}
      </div>

      {onCreate && full ? (
        <p className={styles.savedFull}>
          {translation("TrackedLinks.create.full", { limit })}
        </p>
      ) : null}

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

              <RowAction
                kind="delete"
                compact
                label={translation("Broadcast.linkLibrary.delete", {
                  label: link.label,
                })}
                onClick={() => onDelete(link)}
              />
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
