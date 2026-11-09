"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useAuth } from "@/app/AuthContext";
import NewBadge from "@/app/components/NewBadge/NewBadge";
import Pagination from "@/app/components/Pagination/Pagination";
import useOrganization from "@/app/hooks/useOrganization";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import useSeenSince from "@/app/hooks/useSeenSince";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";

import useDeleteTrackedLink from "../hooks/useDeleteTrackedLink";
import SavedLinksSection from "./components/SavedLinksSection";
import styles from "./tracked-links.module.css";

function formatDate(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString();
}

function getRateClass(rate) {
  const n = Number(rate || 0);
  if (n >= 70) return styles.rateGood;
  if (n <= 20) return styles.rateBad;
  return styles.rateNeutral;
}

/**
 * Links Rastreados, em duas partes:
 * - Links criados: os que contam para os 100 do plano, com o ✕ e o "Novo";
 * - Links enviados: um grupo por link (nome + destino) com os totais e, ao
 *   abrir, cada envio. Um link eliminado fica com outra cor; criado outra
 *   vez, o grupo volta à cor normal. As estatísticas nunca se perdem.
 */
export default function TrackedLinksPage() {
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();
  const translation = useTranslations();
  const showAlert = useAlert();

  const showAlertRef = useRef(showAlert);
  useEffect(() => {
    showAlertRef.current = showAlert;
  }, [showAlert]);

  const [links, setLinks] = useState([]);
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const { limits, usage, reload: reloadPlanUsage } = usePlanLimits(org?.id);
  const isNew = useSeenSince("seen.trackedLinks", org?.id);

  const reload = useCallback(() => {
    setAttempt((n) => n + 1);
    reloadPlanUsage();
  }, [reloadPlanUsage]);

  const deleteLink = useDeleteTrackedLink(org?.id, { onDeleted: reload });

  useEffect(() => {
    if (orgLoading) return;

    if (!org?.id) {
      setLoading(false);
      stopLoading();

      void showAlertRef.current({
        title: translation("TrackedLinks.alerts.noOrg.title"),
        message: translation("TrackedLinks.alerts.noOrg.message"),
        tone: "warning",
      });

      return;
    }

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/tracked-links/overview?orgId=${org.id}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load tracked links.");
        }

        if (!alive) return;
        setLinks(Array.isArray(data?.links) ? data.links : []);
      } catch {
        if (!alive) return;

        setError(translation("TrackedLinks.alerts.loadFailed.message"));
        void showAlertRef.current({
          title: translation("TrackedLinks.alerts.loadFailed.title"),
          message: translation("TrackedLinks.alerts.loadFailed.message"),
          tone: "danger",
        });
      } finally {
        if (alive) {
          setLoading(false);
          stopLoading();
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [org?.id, orgLoading, stopLoading, translation, attempt]);

  /* Links criados: os guardados e não eliminados (contam para o plano). */
  const createdLinks = useMemo(
    () => links.filter((link) => link.id && !link.deleted),
    [links],
  );

  /* Links enviados: um grupo por link com pelo menos um envio. */
  const sentLinks = useMemo(
    () => links.filter((link) => link.sends.length > 0),
    [links],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return sentLinks.filter((link) => {
      if (!showDeleted && link.deleted) return false;
      if (!term) return true;

      return [
        link.label,
        link.key,
        link.destinationUrl,
        ...link.sends.map((s) => s.channel),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [sentLinks, q, showDeleted]);

  /* Uma pesquisa ou um filtro novo volta à primeira página. */
  useEffect(() => {
    setPage(1);
  }, [q, showDeleted, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function toggle(rowKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  const createdCount = usage?.trackedLinks ?? createdLinks.length;
  const createdLimit = limits?.trackedLinks;

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.stats}>
          {/* Os que contam para o plano (os eliminados não contam). */}
          <div
            className={styles.statCard}
            title={translation("Plans.usage.trackedLinksHint")}
          >
            <div className={styles.statLabel}>
              {translation("TrackedLinks.createdCard")}
            </div>
            <div
              className={`${styles.statValue} ${
                createdLimit != null && createdCount >= createdLimit
                  ? styles.statFull
                  : ""
              }`}
            >
              {createdCount}
              {createdLimit != null ? (
                <span className={styles.statLimit}> / {createdLimit}</span>
              ) : null}
            </div>
          </div>

          {/* Quantos links diferentes já foram enviados. */}
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("TrackedLinks.sentCard")}
            </div>
            <div className={styles.statValue}>{sentLinks.length}</div>
          </div>
        </div>
      </div>

      {org?.id ? (
        <SavedLinksSection
          links={createdLinks}
          loading={loading}
          isNew={isNew}
          onDelete={deleteLink}
        />
      ) : null}

      <section className={styles.sentSection}>
        <div>
          <h2 className={styles.savedTitle}>
            {translation("TrackedLinks.sent.title")}
          </h2>
          <p className={styles.subtitle}>
            {translation("TrackedLinks.sent.description")}
          </p>
        </div>

        <div className={styles.toolbarRow}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <Search size={18} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={translation("TrackedLinks.search")}
              className={styles.searchInput}
            />
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            {translation("TrackedLinks.showDeleted")}
          </label>
        </div>

        {loading && (
          <div className={styles.emptyBox}>
            {translation("TrackedLinks.loading")}
          </div>
        )}

        {!loading && error && <div className={styles.errorBox}>{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className={styles.emptyBox}>
            {translation("TrackedLinks.noLinks")}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className={styles.tableCard}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th aria-hidden />
                    <th>{translation("TrackedLinks.table.label")}</th>
                    <th>{translation("TrackedLinks.table.destination")}</th>
                    <th>{translation("TrackedLinks.table.sends")}</th>
                    <th>{translation("TrackedLinks.table.recipients")}</th>
                    <th>{translation("TrackedLinks.table.clicked")}</th>
                    <th>{translation("TrackedLinks.table.clickRate")}</th>
                    <th>{translation("TrackedLinks.table.lastSent")}</th>
                  </tr>
                </thead>

                <tbody>
                  {visible.map((link) => {
                    const rowKey =
                      link.id || `${link.label}\n${link.destinationUrl}`;
                    const open = expanded.has(rowKey);

                    return (
                      <Fragment key={rowKey}>
                        <tr
                          className={
                            link.deleted ? styles.rowDeleted : undefined
                          }
                        >
                          <td className={styles.expandCell}>
                            <button
                              type="button"
                              className={styles.expandBtn}
                              aria-expanded={open}
                              aria-label={translation(
                                open
                                  ? "TrackedLinks.hideSends"
                                  : "TrackedLinks.showSends",
                                { label: link.label },
                              )}
                              onClick={() => toggle(rowKey)}
                            >
                              {open ? (
                                <ChevronDown size={16} />
                              ) : (
                                <ChevronRight size={16} />
                              )}
                            </button>
                          </td>
                          <td>
                            <div className={styles.mainText}>
                              {link.label || "-"}
                              {!link.deleted && isNew(link.createdAt) ? (
                                <NewBadge />
                              ) : null}
                              {link.deleted ? (
                                <span className={styles.deletedTag}>
                                  {translation("TrackedLinks.deleted")}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div
                              className={styles.urlCell}
                              title={link.destinationUrl}
                            >
                              {link.destinationUrl || "-"}
                            </div>
                          </td>
                          <td className={styles.numberCell}>
                            {link.totals.sends}
                          </td>
                          <td className={styles.numberCell}>
                            {link.totals.recipients}
                          </td>
                          <td className={styles.numberCell}>
                            {link.totals.clicked}
                          </td>
                          <td className={getRateClass(link.totals.clickRate)}>
                            {link.totals.clickRate}%
                          </td>
                          <td>{formatDate(link.sends[0].createdAt)}</td>
                        </tr>

                        {open
                          ? link.sends.map((send, index) => (
                              <tr
                                key={`${rowKey}-${send.sendGroupId || index}`}
                                className={`${styles.sendRow} ${
                                  link.deleted ? styles.sendRowDeleted : ""
                                }`}
                              >
                                <td />
                                <td colSpan={2}>
                                  <span className={styles.channelBadge}>
                                    {send.channel || "-"}
                                  </span>
                                  <span className={styles.sendDate}>
                                    {formatDate(send.createdAt)}
                                  </span>
                                </td>
                                <td>
                                  {send.sendGroupId ? (
                                    <Link
                                      href={`/broadcast/tracked-links/detail?${new URLSearchParams(
                                        { sendGroupId: send.sendGroupId },
                                      ).toString()}`}
                                      className={styles.viewBtn}
                                    >
                                      {translation("TrackedLinks.view")}
                                    </Link>
                                  ) : null}
                                </td>
                                <td className={styles.numberCell}>
                                  {send.recipientCount}
                                </td>
                                <td className={styles.numberCell}>
                                  {send.clickedCount}
                                </td>
                                <td className={getRateClass(send.clickRate)}>
                                  {send.clickRate}%
                                </td>
                                <td />
                              </tr>
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={currentPage}
              pageSize={pageSize}
              total={filtered.length}
              sizes={[10, 20, 50]}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              summary={translation("TrackedLinks.pagination", {
                page: currentPage,
                pages: totalPages,
                total: filtered.length,
              })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
