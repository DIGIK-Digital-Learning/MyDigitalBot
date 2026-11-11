"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";

import styles from "./media.module.css";
import RowAction from "@/app/components/RowAction/RowAction";

function formatDate(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString();
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;

  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;

  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name) {
  const parts = String(name || "").split(".");

  return parts.length > 1 ? parts.pop().slice(0, 4).toUpperCase() : "";
}

function mediaKind(contentType) {
  const type = String(contentType || "");

  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("video/")) return "video";

  return "other";
}

/**
 * Ícone com explicação ao passar o rato ou ao focar. A explicação é fixa no
 * ecrã, para não ser cortada pela tabela, que tem scroll próprio.
 */
function InfoHint({ text }) {
  const [pos, setPos] = useState(null);

  function show(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + 8 });
  }

  return (
    <span
      className={styles.infoHint}
      tabIndex={0}
      role="img"
      aria-label={text}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
    >
      <Info size={15} aria-hidden />
      {pos ? (
        <span
          className={styles.infoTooltip}
          style={{ top: pos.top, right: pos.right }}
          aria-hidden
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Ficheiros carregados nas mensagens (imagens, PDF e vídeos), com o espaço
 * que ocupam. Um ficheiro usado numa mensagem por enviar não pode ser apagado.
 */
export default function MediaPage() {
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();
  const translation = useTranslations();
  const showAlert = useAlert();
  const confirm = useConfirm();

  /* Refs para o efeito de carregamento não depender destas funções. */
  const showAlertRef = useRef(showAlert);
  const translationRef = useRef(translation);

  useEffect(() => {
    showAlertRef.current = showAlert;
    translationRef.current = translation;
  }, [showAlert, translation]);

  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingPath, setDeletingPath] = useState(null);

  useEffect(() => {
    if (orgLoading) return;

    /* Sem organização ainda: fica a carregar até o hook a resolver. */
    if (!org?.id) return;

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/media?orgId=${org.id}`, {
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load media.");
        }

        if (!alive) return;

        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!alive) return;

        const t = translationRef.current;
        setError(t("Media.alerts.loadFailed.message"));

        void showAlertRef.current({
          title: t("Media.alerts.loadFailed.title"),
          message: t("Media.alerts.loadFailed.message"),
          tone: "danger",
        });
      } finally {
        if (!alive) return;

        setLoading(false);
        stopLoading();
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, orgLoading, stopLoading]);

  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + (item.size || 0), 0),
    [items],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) =>
      String(item.name || "").toLowerCase().includes(term),
    );
  }, [items, q]);

  async function handleDelete(item) {
    const ok = await confirm({
      title: translation("Media.confirm.title", { name: item.name }),
      message: translation("Media.confirm.message"),
      confirmText: translation("Common.delete"),
      cancelText: translation("Common.cancel"),
      tone: "danger",
    });

    if (!ok) return;

    setDeletingPath(item.path);

    try {
      const res = await fetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org.id,
          bucket: item.bucket,
          path: item.path,
        }),
      });

      if (res.status === 409) {
        /* Foi agendado entretanto: marca-o como em uso. */
        setItems((prev) =>
          prev.map((x) => (x.path === item.path ? { ...x, inUse: true } : x)),
        );

        await showAlert({
          title: translation("Media.alerts.inUse.title"),
          message: translation("Media.inUseHint"),
          tone: "warning",
        });

        return;
      }

      if (!res.ok) throw new Error("Failed to delete media.");

      setItems((prev) => prev.filter((x) => x.path !== item.path));
    } catch {
      await showAlert({
        title: translation("Media.alerts.deleteFailed.title"),
        message: translation("Media.alerts.deleteFailed.message"),
        tone: "danger",
      });
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{translation("Media.title")}</h1>
          <p className={styles.subtitle}>{translation("Media.subtitle")}</p>
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("Media.totalSize")}
            </div>
            <div className={styles.statValue}>{formatBytes(totalBytes)}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("Media.totalFiles")}
            </div>
            <div className={styles.statValue}>{items.length}</div>
          </div>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Search size={18} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={translation("Media.search")}
            className={styles.searchInput}
          />
        </div>
      </div>

      {loading && (
        <div className={styles.emptyBox}>{translation("Media.loading")}</div>
      )}

      {!loading && error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className={styles.emptyBox}>
          {translation(q.trim() ? "Media.noMatches" : "Media.noFiles")}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="media-table">
              <colgroup>
                <col />
                <col className={styles.colSize} />
                <col className={styles.colDate} />
                <col className={styles.colStatus} />
                <col className={styles.colAction} />
              </colgroup>

              <thead>
                <tr>
                  <th>{translation("Media.table.file")}</th>
                  <th className={styles.numeric}>
                    {translation("Media.table.size")}
                  </th>
                  <th>{translation("Media.table.uploaded")}</th>
                  <th>{translation("Media.table.status")}</th>
                  <th aria-label={translation("Common.delete")} />
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => {
                  const kind = mediaKind(item.contentType);

                  return (
                    <tr key={`${item.bucket}/${item.path}`}>
                      <td>
                        <div className={styles.fileCell}>
                          {kind === "image" && item.url ? (
                            <img
                              src={item.url}
                              alt=""
                              className={styles.thumb}
                              loading="lazy"
                            />
                          ) : (
                            <span className={styles.thumbPlaceholder}>
                              {fileExtension(item.name)}
                            </span>
                          )}

                          <div className={styles.fileText}>
                            <a
                              href={item.url || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.fileLink}
                              title={item.name}
                            >
                              {item.name}
                            </a>
                            <span className={styles.fileMeta}>
                              {translation(`Media.type.${kind}`)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className={styles.numeric}>
                        {formatBytes(item.size)}
                      </td>

                      <td>{formatDate(item.createdAt)}</td>

                      <td>
                        {item.inUse ? (
                          <span className={styles.statusCell}>
                            {item.usedBy?.kind === "scheduled" ? (
                              <Link
                                href={`/broadcast/scheduled?view=${encodeURIComponent(item.usedBy.id)}`}
                                className={`${styles.inUse} ${styles.inUseLink}`}
                                title={translation("Media.openScheduled")}
                              >
                                {translation("Media.status.inUse")}
                              </Link>
                            ) : (
                              <span className={styles.inUse}>
                                {translation("Media.status.inUse")}
                              </span>
                            )}

                            <InfoHint text={translation("Media.inUseHint")} />
                          </span>
                        ) : (
                          <span className={styles.muted}>
                            {translation("Media.status.free")}
                          </span>
                        )}
                      </td>

                      <td className={styles.actionCell}>
                        {item.downloadUrl ? (
                          <a
                            href={item.downloadUrl}
                            className={styles.downloadButton}
                            aria-label={translation("Media.download", {
                              name: item.name,
                            })}
                            title={translation("Media.download", {
                              name: item.name,
                            })}
                          >
                            <Download size={16} aria-hidden />
                          </a>
                        ) : null}

                        <RowAction
                          kind="delete"
                          label={translation("Common.delete")}
                          onClick={() => handleDelete(item)}
                          disabled={item.inUse || deletingPath === item.path}
                          title={
                            item.inUse
                              ? translation("Media.inUseHint")
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
