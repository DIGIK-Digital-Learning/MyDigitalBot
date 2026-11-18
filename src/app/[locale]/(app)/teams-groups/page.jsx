"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useAuth } from "@/app/AuthContext";
import { Skeleton, SkeletonTable } from "@/app/components/Skeleton/Skeleton";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";

import { formatDate, groupTypeKey } from "./groups.helpers";
import styles from "./teams-groups.module.css";

function detailHref(item) {
  return (
    `/teams-groups/detail?` + new URLSearchParams({ groupId: String(item.id) })
  );
}

/**
 * Chats de grupo e equipas do Teams onde o bot foi adicionado (#165). Cada
 * linha abre o detalhe com os membros e a conversa.
 */
export default function TeamsGroupsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();
  const translation = useTranslations();
  const showAlert = useAlert();

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

  useEffect(() => {
    if (orgLoading) return;

    /* Sem organização ainda: fica a carregar até o hook a resolver. */
    if (!org?.id) return;

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/teams-groups?orgId=${org.id}`, {
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load Teams groups.");
        }

        if (!alive) return;

        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!alive) return;

        const t = translationRef.current;
        setError(t("TeamsGroups.alerts.loadFailed.message"));

        void showAlertRef.current({
          title: t("TeamsGroups.alerts.loadFailed.title"),
          message: t("TeamsGroups.alerts.loadFailed.message"),
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

  const groupName = (item) => item.name || translation("TeamsGroups.unnamed");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) =>
      String(item.name || "")
        .toLowerCase()
        .includes(term),
    );
  }, [items, q]);

  const activeCount = items.filter((item) => item.isActive).length;

  /*
   * A linha inteira abre o detalhe com um clique simples. Cliques com
   * modificadores ficam para a ligação do nome (nova aba, etc.).
   */
  function openDetail(event, item) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    router.push(detailHref(item));
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>{translation("TeamsGroups.title")}</h1>
          <p className={styles.subtitle}>
            {translation("TeamsGroups.subtitle")}
          </p>
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("TeamsGroups.totalGroups")}
            </div>
            <div className={styles.statValue}>
              {loading ? <Skeleton width={36} height={28} /> : items.length}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("TeamsGroups.activeGroups")}
            </div>
            <div className={styles.statValue}>
              {loading ? <Skeleton width={36} height={28} /> : activeCount}
            </div>
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
            placeholder={translation("TeamsGroups.search")}
            className={styles.searchInput}
          />
        </div>
      </div>

      {loading && (
        <SkeletonTable columns={4} label={translation("TeamsGroups.loading")} />
      )}

      {!loading && error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className={styles.emptyBox}>
          {translation(
            q.trim() ? "TeamsGroups.noMatches" : "TeamsGroups.empty",
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="teams-groups-table">
              <colgroup>
                <col />
                <col className={styles.colAssistant} />
                <col className={styles.colDate} />
                <col className={styles.colStatus} />
              </colgroup>

              <thead>
                <tr>
                  <th>{translation("TeamsGroups.table.group")}</th>
                  <th>{translation("TeamsGroups.table.assistant")}</th>
                  <th>{translation("TeamsGroups.table.lastMessage")}</th>
                  <th>{translation("TeamsGroups.table.status")}</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={styles.row}
                    onClick={(event) => openDetail(event, item)}
                  >
                    <td>
                      <div className={styles.nameCell}>
                        <Link
                          href={detailHref(item)}
                          className={styles.nameLink}
                          title={groupName(item)}
                        >
                          {groupName(item)}
                        </Link>
                        <span className={styles.meta}>
                          {translation(
                            `TeamsGroups.type.${groupTypeKey(item.conversationType)}`,
                          )}
                        </span>
                      </div>
                    </td>

                    <td>
                      {item.assistantName || (
                        <span className={styles.muted}>-</span>
                      )}
                    </td>

                    <td>
                      {item.lastMessageAt ? (
                        formatDate(item.lastMessageAt)
                      ) : (
                        <span className={styles.muted}>
                          {translation("TeamsGroups.never")}
                        </span>
                      )}
                    </td>

                    <td>
                      {item.isActive ? (
                        translation("TeamsGroups.status.active")
                      ) : (
                        <span className={styles.removed}>
                          {translation("TeamsGroups.status.removed")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
