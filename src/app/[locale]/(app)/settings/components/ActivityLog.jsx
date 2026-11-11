"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import styles from "../settings.module.css";
import {
  ALL_AREAS,
  PAGE_SIZE,
  buildAreaOptions,
  buildQueryString,
  totalPages,
} from "../helpers/activity.helpers";

import ActivityFilters from "./ActivityFilters";
import useRefreshOnReturn from "@/app/hooks/useRefreshOnReturn";
import ActivityTable from "./ActivityTable";
import ActivityPagination from "./ActivityPagination";

/**
 * Secção do histórico de atividade: filtros, tabela e paginação.
 *
 * Recebe a organização já resolvida pela página.
 */
export default function ActivityLog({ orgId }) {
  const translation = useTranslations("ActivityLog");
  const locale = useLocale();

  const [area, setArea] = useState(ALL_AREAS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const areaOptions = useMemo(
    () => buildAreaOptions(translation),
    [translation],
  );

  const hasFilters = area !== ALL_AREAS || Boolean(from) || Boolean(to);

  /* `silent`: ao voltar à página (#236) a tabela troca sem piscar. */
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!orgId) return;

    if (!silent) {
      setLoading(true);
      setLoadFailed(false);
    }

    try {
      const query = buildQueryString({
        orgId,
        area,
        from,
        to,
        page,
        pageSize: PAGE_SIZE,
      });

      const response = await fetch(`/api/audit-log?${query}`);
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Failed to load activity log");
      }

      setItems(Array.isArray(result.items) ? result.items : []);
      setTotal(Number(result.total) || 0);
      setLoadFailed(false);
    } catch (err) {
      console.warn("[ActivityLog] load error:", err);
      /* Em silêncio, uma falha deixa ficar a tabela que já estava. */
      if (silent) return;
      setItems([]);
      setTotal(0);
      setLoadFailed(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [orgId, area, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnReturn(useCallback(() => load({ silent: true }), [load]));

  const pages = totalPages(total, PAGE_SIZE);

  function changeArea(next) {
    setArea(next || ALL_AREAS);
    setPage(1);
  }

  function changeFrom(next) {
    setFrom(next);
    setPage(1);
  }

  function changeTo(next) {
    setTo(next);
    setPage(1);
  }

  function clearFilters() {
    setArea(ALL_AREAS);
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className={styles.activity}>
      <ActivityFilters
        translation={translation}
        area={area}
        areaOptions={areaOptions}
        onAreaChange={changeArea}
        from={from}
        to={to}
        onFromChange={changeFrom}
        onToChange={changeTo}
        onClear={clearFilters}
      />

      {loadFailed ? (
        <div className={styles.errorBox} role="alert">
          {translation("Errors.load")}
        </div>
      ) : null}

      <div className={styles.tableCard}>
        <ActivityTable
          translation={translation}
          locale={locale}
          items={items}
          loading={loading}
          hasFilters={hasFilters}
        />

        <ActivityPagination
          translation={translation}
          page={page}
          pages={pages}
          total={total}
          loading={loading}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(pages, current + 1))}
        />
      </div>
    </div>
  );
}
