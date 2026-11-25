"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useAuth } from "@/app/AuthContext";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import { SkeletonTable } from "@/app/components/Skeleton/Skeleton";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import { QUESTION_KINDS } from "@/lib/whatsapp/question";

import styles from "./questions.module.css";
import usePermissions from "@/app/PermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";

const KIND_FILTER_ALL = "all";

const PILL_STYLE = {
  height: "44px",
  padding: "0 16px",
  borderRadius: "9999px",
  boxSizing: "border-box",
};

function formatDate(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString();
}

/* Dia local no formato do input de data (AAAA-MM-DD), para comparar. */
function toDateInputValue(value) {
  if (!value) return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* Textos das folhas do Excel, já traduzidos. */
function buildExportLabels(translation) {
  return {
    ...translation.raw("Questions.export.columns"),
    kind: translation.raw("Questions.kind"),
    verdicts: translation.raw("Questions.detail.verdicts"),
  };
}

function detailHref(item) {
  return (
    `/broadcast/questions/detail?` +
    new URLSearchParams({ questionId: String(item.id) })
  );
}

/**
 * Lista das perguntas enviadas (quiz, sondagem e pergunta aberta) com os
 * totais de respostas. Cada linha abre o detalhe.
 */
export default function QuestionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();
  const translation = useTranslations();
  const { can, lock } = usePermissions();
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
  const [kindFilter, setKindFilter] = useState(KIND_FILTER_ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (orgLoading) return;

    /* Sem organização ainda: fica a carregar até o hook a resolver. */
    if (!org?.id) return;

    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/questions/reports?orgId=${org.id}`, {
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || "Failed to load questions.");
        }

        if (!alive) return;

        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (!alive) return;

        const t = translationRef.current;
        setError(t("Questions.alerts.loadFailed.message"));

        void showAlertRef.current({
          title: t("Questions.alerts.loadFailed.title"),
          message: t("Questions.alerts.loadFailed.message"),
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

  const kindOptions = useMemo(
    () => [
      { value: KIND_FILTER_ALL, label: translation("Questions.filters.allKinds") },
      ...QUESTION_KINDS.map((kind) => ({
        value: kind,
        label: translation(`Questions.kind.${kind}`),
      })),
    ],
    [translation],
  );

  const hasFilters = Boolean(
    q.trim() || kindFilter !== KIND_FILTER_ALL || dateFrom || dateTo,
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return items.filter((item) => {
      if (term && !String(item.body || "").toLowerCase().includes(term)) {
        return false;
      }

      if (kindFilter !== KIND_FILTER_ALL && item.kind !== kindFilter) {
        return false;
      }

      /* Intervalo de datas de envio, inclusivo nas duas pontas. */
      if (dateFrom || dateTo) {
        const sentDay = toDateInputValue(item.sentAt);
        if (!sentDay) return false;
        if (dateFrom && sentDay < dateFrom) return false;
        if (dateTo && sentDay > dateTo) return false;
      }

      return true;
    });
  }, [items, q, kindFilter, dateFrom, dateTo]);

  const toReviewTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.reviewNeededCount || 0), 0),
    [items],
  );

  function clearFilters() {
    setQ("");
    setKindFilter(KIND_FILTER_ALL);
    setDateFrom("");
    setDateTo("");
  }

  /* Exporta as perguntas que estão na lista, com os filtros aplicados. */
  async function handleExport() {
    if (exporting || !org?.id) return;

    setExporting(true);

    try {
      const res = await fetch(`/api/questions/export?orgId=${org.id}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to export questions.");
      }

      const shown = new Set(filtered.map((item) => String(item.id)));
      const { exportQuestionsExcel } = await import("./lib/questions.excel");

      await exportQuestionsExcel({
        data: {
          questions: (data.questions || []).filter((row) =>
            shown.has(String(row.id)),
          ),
          answers: (data.answers || []).filter((row) =>
            shown.has(String(row.questionId)),
          ),
        },
        labels: buildExportLabels(translation),
        fileName: `${translation("Questions.export.fileName")}-${toDateInputValue(new Date())}.xlsx`,
      });
    } catch {
      void showAlert({
        title: translation("Questions.export.failed.title"),
        message: translation("Questions.export.failed.message"),
        tone: "danger",
      });
    } finally {
      setExporting(false);
    }
  }

  function resultText(item) {
    if (!item.answeredCount) return null;

    if (item.kind === "quiz") {
      return translation("Questions.correctRate", { rate: item.correctRate });
    }

    /* Sondagem: escolhas por opção. */
    if (item.kind === "survey") {
      return (item.options || [])
        .map(
          (option, index) =>
            `${option.label}: ${item.optionCounts?.[index] ?? 0}`,
        )
        .join(" · ");
    }

    const v = item.verdicts || {};
    return translation("Questions.verdictSummary", {
      completa: v.completa || 0,
      parcial: v.parcial || 0,
      incompleta: v.incompleta || 0,
    });
  }

  /*
   * A linha inteira abre o detalhe com um clique simples. Cliques com
   * modificadores ficam para a ligação da pergunta, que o browser trata
   * como qualquer outra (nova aba, etc.).
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
          <h1 className={styles.title}>{translation("Questions.title")}</h1>
          <p className={styles.subtitle}>{translation("Questions.subtitle")}</p>
        </div>

        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("Questions.totalQuestions")}
            </div>
            <div className={styles.statValue}>{items.length}</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>
              {translation("Questions.toReview")}
            </div>
            <div className={styles.statValue}>{toReviewTotal}</div>
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
            placeholder={translation("Questions.search")}
            className={styles.searchInput}
          />
        </div>

        <PillSelect
          value={kindFilter}
          options={kindOptions}
          onChange={(value) => setKindFilter(value)}
          placeholder={translation("Questions.filters.allKinds")}
          className={styles.kindFilter}
          menuWidth={220}
          style={PILL_STYLE}
        />

        <div className={styles.dateRange}>
          <span className={styles.dateLabel}>
            {translation("Questions.filters.sentBetween")}
          </span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className={styles.dateInput}
            aria-label={translation("Questions.filters.from")}
          />
          <span className={styles.dateLabel}>
            {translation("Questions.filters.and")}
          </span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className={styles.dateInput}
            aria-label={translation("Questions.filters.to")}
          />
        </div>

        {hasFilters ? (
          <button
            type="button"
            className={styles.clearButton}
            onClick={clearFilters}
          >
            {translation("Questions.filters.clear")}
          </button>
        ) : null}

        <button
          type="button"
          className={`${styles.clearButton} ${styles.exportButton}`}
          onClick={handleExport}
          disabled={
            loading ||
            Boolean(error) ||
            !filtered.length ||
            exporting ||
            !can(PERMISSIONS.QUESTIONS_EXPORT)
          }
          {...lock(PERMISSIONS.QUESTIONS_EXPORT)}
        >
          {translation(
            exporting ? "Questions.export.exporting" : "Questions.export.button",
          )}
        </button>
      </div>

      {loading && (
        <SkeletonTable columns={4} label={translation("Questions.loading")} />
      )}

      {!loading && error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className={styles.emptyBox}>
          {translation(
            hasFilters ? "Questions.noMatches" : "Questions.noQuestions",
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="questions-table">
              <colgroup>
                <col />
                <col className={styles.colAnswers} />
                <col className={styles.colRate} />
                <col className={styles.colResult} />
              </colgroup>

              <thead>
                <tr>
                  <th>{translation("Questions.table.question")}</th>
                  <th className={styles.numeric}>
                    {translation("Questions.table.answered")}
                  </th>
                  <th className={styles.numeric}>
                    {translation("Questions.table.responseRate")}
                  </th>
                  <th>{translation("Questions.table.result")}</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => {
                  const result = resultText(item);

                  return (
                    <tr
                      key={item.id}
                      className={styles.row}
                      onClick={(event) => openDetail(event, item)}
                    >
                      <td>
                        <div className={styles.questionCell}>
                          <Link
                            href={detailHref(item)}
                            className={styles.questionLink}
                            title={item.body}
                          >
                            {item.body}
                          </Link>
                          <span className={styles.questionMeta}>
                            {translation(`Questions.kind.${item.kind}`)}
                            {" · "}
                            {translation("Questions.sentOn", {
                              date: formatDate(item.sentAt),
                            })}
                          </span>
                        </div>
                      </td>

                      <td className={styles.numeric}>
                        {translation("Questions.answersOf", {
                          answered: item.answeredCount,
                          recipients: item.recipientCount,
                        })}
                      </td>

                      <td className={styles.numeric}>{item.responseRate}%</td>

                      <td>
                        <div className={styles.resultCell}>
                          {result ? (
                            <span>{result}</span>
                          ) : (
                            <span className={styles.muted}>-</span>
                          )}
                          {item.reviewNeededCount > 0 ? (
                            <span className={styles.reviewCount}>
                              {translation("Questions.reviewCount", {
                                count: item.reviewNeededCount,
                              })}
                            </span>
                          ) : null}
                        </div>
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
