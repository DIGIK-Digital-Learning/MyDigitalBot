"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Maximize2, RefreshCw } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import styles from "./analytics.module.css";
import { exportAnalyticsPdf } from "./lib/analytics.export";
import { exportAnalyticsExcel } from "./lib/analytics.excel";
import { buildExcelLabels, buildExcelFileName } from "./lib/analytics.helpers";

/**
 * Opções disponíveis para filtrar as métricas por período.
 */
const PERIOD_OPTIONS = [
  { value: "all", labelKey: "periods.all" },
  { value: "7d", labelKey: "periods.last7Days" },
  { value: "30d", labelKey: "periods.last30Days" },
  { value: "90d", labelKey: "periods.last90Days" },
];

/**
 * Chave usada no localStorage para guardar as secções visíveis.
 */
const SECTION_STORAGE_KEY = "analytics.visibleSections";

/**
 * Secções visíveis por defeito.
 */
const DEFAULT_VISIBLE_SECTIONS = {
  overview: true,
  activity: true,
  automations: true,
  engagement: true,
  distribution: true,
  rankings: true,
  trends: true,
  summary: true,
};

/**
 * Converte um valor para número de forma segura.
 */
function safeNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Calcula uma percentagem de forma segura, limitada a 100.
 */
function safePercent(part, total) {
  const totalNumber = safeNumber(total);
  if (totalNumber <= 0) return 0;
  return Math.min(100, Math.round((safeNumber(part) / totalNumber) * 100));
}

/**
 * Célula de métrica: etiqueta, número grande, barra opcional e contexto.
 */
function Stat({ label, value, meta, percent, attention = false, href }) {
  const body = (
    <>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statBody}>
        <span className={styles.statValue}>{value}</span>
        {typeof percent === "number" ? (
          <span className={styles.statBar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        ) : null}
        {meta ? (
          <span
            className={`${styles.statMeta} ${attention ? styles.statAttention : ""}`}
          >
            {meta}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles.stat}>
        {body}
      </Link>
    );
  }

  return <div className={styles.stat}>{body}</div>;
}

/**
 * Painel de secção com cabeçalho, descrição, link e botão para ocultar.
 */
function Section({
  title,
  description,
  linkHref,
  linkLabel,
  visible = true,
  onToggle,
  toggleLabels,
  children,
}) {
  return (
    <section data-pdf-section={visible ? "" : undefined} data-html2canvas-ignore={visible ? undefined : "true"} className={`${styles.section} ${!visible ? styles.sectionCollapsed : ""}`}>
      <header className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className={styles.sectionActions} data-html2canvas-ignore="true">
          {linkHref && visible ? (
            <Link href={linkHref} className={styles.sectionLink}>
              {linkLabel}
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
          {onToggle ? (
            <button type="button" className={styles.sectionToggle} onClick={onToggle}>
              {visible ? toggleLabels.hide : toggleLabels.show}
            </button>
          ) : null}
        </div>
      </header>
      {visible ? children : null}
    </section>
  );
}

/**
 * Lista de barras horizontais para distribuições por categoria.
 */
function Breakdown({ title, items, format, emptyMessage }) {
  const total = items.reduce((sum, item) => sum + safeNumber(item.value), 0);
  const max = Math.max(1, ...items.map((item) => safeNumber(item.value)));

  return (
    <div className={styles.breakdown}>
      <div className={styles.breakdownHeader}>
        <h3>{title}</h3>
        <strong>{format(total)}</strong>
      </div>
      {total > 0 ? (
        <ul className={styles.breakdownList}>
          {items.map((item) => {
            const value = safeNumber(item.value);
            return (
              <li key={item.key} className={styles.breakdownRow}>
                <span className={styles.breakdownMeta}>
                  <span className={styles.breakdownLabel}>{item.label}</span>
                  <span className={styles.breakdownValue}>
                    {format(value)}
                    <small>{safePercent(value, total)}%</small>
                  </span>
                </span>
                <span className={styles.breakdownTrack} aria-hidden="true">
                  <span
                    className={styles.breakdownFill}
                    data-tone={item.tone || "brand"}
                    style={{ width: `${(value / max) * 100}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.emptyState}>{emptyMessage}</p>
      )}
    </div>
  );
}

/* ───────── Daily trends ───────── */

const toDate = (value) => new Date(`${value}T00:00:00Z`);

/**
 * "10 jun" / "Jun 10": dia e mês curtos, sem preposições nem ponto final.
 */
function shortDay(date, locale) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .formatToParts(date)
    .filter((part) => part.type === "day" || part.type === "month")
    .map((part) => part.value.replace(/\.$/, ""))
    .join(" ");
}

function fullDay(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Arredonda o máximo do eixo para um valor "limpo" logo acima do valor real,
 * para a linha aproveitar a altura do gráfico.
 */
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

function niceCeil(value) {
  if (value <= 0) return 1;
  if (value <= 5) return Math.ceil(value);
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const ratio = value / base;
  const step = NICE_STEPS.find((candidate) => ratio <= candidate) || 10;
  return Math.round(step * base);
}

/**
 * Converte uma série diária da API em pontos {date, value}.
 */
function toPoints(series, key) {
  return (Array.isArray(series) ? series : []).map((item) => ({
    date: item.date,
    value: safeNumber(item[key]),
  }));
}

/**
 * Resumo numérico de uma série: total, pico, média e últimos 7 dias.
 */
function summarize(points) {
  const values = points.map((point) => point.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const activeDays = values.filter((value) => value > 0).length;
  const peakIndex = values.length ? values.indexOf(Math.max(...values)) : -1;
  const lastWeek = values.slice(-7).reduce((sum, value) => sum + value, 0);
  const previousWeek = values.slice(-14, -7).reduce((sum, value) => sum + value, 0);

  return {
    total,
    days: values.length,
    activeDays,
    average: values.length ? total / values.length : 0,
    activeAverage: activeDays ? total / activeDays : 0,
    peakIndex,
    peakValue: peakIndex >= 0 ? values[peakIndex] : 0,
    lastWeek,
    previousWeek,
  };
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    update();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

/**
 * Gráfico de linha em SVG com grelha, eixos e leitura ao passar o rato.
 * Com `fill`, ocupa a altura do contentor em vez de uma altura fixa.
 */
function LineChart({
  points,
  locale,
  format,
  t,
  tone = "brand",
  height: fixedHeight = 190,
  detailed = false,
  fill = false,
}) {
  const [containerRef, size] = useElementSize();
  const [hoverIndex, setHoverIndex] = useState(null);

  const width = size.width;
  const height = fill ? size.height : fixedHeight;

  const count = points.length;
  const values = points.map((point) => point.value);
  const rawMax = Math.max(0, ...values);
  const hasData = rawMax > 0;

  const pad = { top: 12, right: 12, bottom: 26, left: detailed ? 48 : 40 };
  const innerWidth = Math.max(0, width - pad.left - pad.right);
  const innerHeight = Math.max(0, height - pad.top - pad.bottom);
  const max = niceCeil(rawMax);

  const x = (index) =>
    pad.left + (count > 1 ? (index / (count - 1)) * innerWidth : innerWidth / 2);
  const y = (value) => pad.top + innerHeight - (value / max) * innerHeight;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");
  const areaPath = count
    ? `${linePath} L${x(count - 1).toFixed(1)},${(pad.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + innerHeight).toFixed(1)} Z`
    : "";

  const ticks = max % 2 === 0 ? [0, max / 2, max] : [0, max];
  const labelStep = Math.max(1, Math.ceil(count / (detailed ? 12 : 6)));
  const labelIndexes = points.map((_, index) => index).filter((index) => index % labelStep === 0);

  function handleMove(event) {
    if (!count || !innerWidth) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - pad.left) / innerWidth;
    const index = Math.round(ratio * (count - 1));
    setHoverIndex(Math.min(count - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;
  const hoverX = hovered ? x(hoverIndex) : 0;
  const tooltipSide = hoverX < 110 ? "start" : hoverX > width - 110 ? "end" : "middle";

  return (
    <div
      ref={containerRef}
      className={styles.lineChart}
      style={fill ? undefined : { height }}
      data-tone={tone}
    >
      {width > 0 && height > 0 && count > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className={styles.lcGrid}
                x1={pad.left}
                x2={width - pad.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className={styles.lcAxis} x={pad.left - 8} y={y(tick) + 4} textAnchor="end">
                {format(tick)}
              </text>
            </g>
          ))}
          {labelIndexes.map((index) => (
            <text
              key={index}
              className={styles.lcAxis}
              x={x(index)}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index >= count - labelStep ? "end" : "middle"}
            >
              {shortDay(toDate(points[index].date), locale)}
            </text>
          ))}
          {hasData ? (
            <>
              <path className={styles.lcArea} d={areaPath} />
              <path className={styles.lcLine} d={linePath} />
            </>
          ) : (
            <path className={styles.lcFlat} d={linePath} />
          )}
          {hovered ? (
            <g>
              <line
                className={styles.lcCursor}
                x1={hoverX}
                x2={hoverX}
                y1={pad.top}
                y2={pad.top + innerHeight}
              />
              <circle className={styles.lcDot} cx={hoverX} cy={y(hovered.value)} r={4} />
            </g>
          ) : null}
        </svg>
      ) : null}
      {hovered ? (
        <div
          className={styles.lcTooltip}
          data-side={tooltipSide}
          style={{ left: hoverX, top: y(hovered.value) - 12 }}
        >
          <span>{fullDay(toDate(hovered.date), locale)}</span>
          <strong>{format(hovered.value)}</strong>
        </div>
      ) : null}
      {!hasData && width > 0 ? <p className={styles.lcEmpty}>{t("trends.empty")}</p> : null}
    </div>
  );
}

/**
 * Painel compacto de uma série diária, com botão para expandir.
 */
function TrendPanel({ trend, locale, format, t, onExpand }) {
  const summary = summarize(trend.points);

  return (
    <div className={styles.trend}>
      <div className={styles.trendHeader}>
        <div className={styles.trendTitle}>
          <h3>{trend.title}</h3>
          <button
            type="button"
            className={styles.trendExpand}
            data-html2canvas-ignore="true"
            onClick={onExpand}
            aria-label={t("trends.expand")}
            title={t("trends.expand")}
          >
            <Maximize2 size={14} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.trendFigures}>
          <strong>{format(summary.total)}</strong>
          <span>
            {summary.total > 0
              ? t("trends.peak", {
                  count: format(summary.peakValue),
                  date: shortDay(toDate(trend.points[summary.peakIndex].date), locale),
                })
              : t("trends.empty")}
          </span>
        </div>
      </div>
      <LineChart points={trend.points} locale={locale} format={format} t={t} tone={trend.tone} />
    </div>
  );
}

/**
 * Modal com a análise detalhada de uma série diária.
 */
function TrendModal({ trend, locale, format, decimalFormat, t, onClose }) {
  const summary = summarize(trend.points);
  const topDays = [...trend.points]
    .filter((point) => point.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  let weekDelta = t("trends.detail.lastWeekNoBase");
  if (summary.previousWeek > 0) {
    const percent = Math.round(((summary.lastWeek - summary.previousWeek) / summary.previousWeek) * 100);
    weekDelta = t("trends.detail.lastWeekMeta", {
      delta: `${percent > 0 ? "+" : ""}${percent}%`,
    });
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <section
        className={`${styles.modal} ${styles.modalFull}`}
        role="dialog"
        aria-modal="true"
        aria-label={trend.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.sectionHeader}>
          <div className={styles.sectionCopy}>
            <h2>{trend.title}</h2>
            <p>{trend.description}</p>
          </div>
          <button type="button" className={styles.sectionToggle} onClick={onClose}>
            {t("trends.close")}
          </button>
        </header>
        <div className={styles.detailBody}>
          <div className={styles.detailStats}>
            <div className={styles.detailStat}>
              <span>{t("trends.detail.total")}</span>
              <strong>{format(summary.total)}</strong>
              <small>
                {t("trends.detail.totalMeta", {
                  active: format(summary.activeDays),
                  days: format(summary.days),
                })}
              </small>
            </div>
            <div className={styles.detailStat}>
              <span>{t("trends.detail.average")}</span>
              <strong>{decimalFormat(summary.average)}</strong>
              <small>
                {t("trends.detail.averageMeta", { value: decimalFormat(summary.activeAverage) })}
              </small>
            </div>
            <div className={styles.detailStat}>
              <span>{t("trends.detail.peak")}</span>
              <strong>{format(summary.peakValue)}</strong>
              <small>
                {summary.peakValue > 0
                  ? t("trends.detail.peakMeta", {
                      date: fullDay(toDate(trend.points[summary.peakIndex].date), locale),
                    })
                  : t("trends.empty")}
              </small>
            </div>
            <div className={styles.detailStat}>
              <span>{t("trends.detail.lastWeek")}</span>
              <strong>{format(summary.lastWeek)}</strong>
              <small>{weekDelta}</small>
            </div>
          </div>

          <div className={styles.detailLayout}>
            <div className={styles.detailChart}>
              <LineChart
                points={trend.points}
                locale={locale}
                format={format}
                t={t}
                tone={trend.tone}
                detailed
                fill
              />
            </div>

            <aside className={styles.detailAside}>
              <h3>{t("trends.detail.topDays")}</h3>
              {topDays.length ? (
                <table className={styles.rankingTable}>
                  <thead>
                    <tr>
                      <th className={styles.rankingIndex}>#</th>
                      <th>{t("trends.detail.columns.day")}</th>
                      <th className={styles.rankingNumber}>{t("trends.detail.columns.value")}</th>
                      <th className={styles.rankingNumber}>{t("trends.detail.columns.share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDays.map((point, index) => (
                      <tr key={point.date}>
                        <td className={styles.rankingIndex}>
                          <span className={styles.rankingRank}>{index + 1}</span>
                        </td>
                        <td>
                          <span className={styles.rankingLabel}>
                            {fullDay(toDate(point.date), locale)}
                          </span>
                        </td>
                        <td className={styles.rankingNumber}>{format(point.value)}</td>
                        <td className={styles.rankingNumber}>
                          {safePercent(point.value, summary.total)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.emptyState}>{t("trends.empty")}</p>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Tabela de ranking de links.
 */
const MEDALS = ["gold", "silver", "bronze"];

function LinksTable({ rows, maxClicks, offset = 0, format, t }) {
  const max = Math.max(1, safeNumber(maxClicks), ...rows.map((row) => safeNumber(row.clicks)));

  return (
    <table className={styles.rankingTable}>
      <thead>
        <tr>
          <th className={styles.rankingIndex}>#</th>
          <th>{t("rankings.columns.link")}</th>
          <th className={styles.rankingNumber}>{t("rankings.columns.clicks")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const position = offset + index;
          const medal = MEDALS[position];
          return (
            <tr key={row.id || `${offset}-${index}`} data-medal={medal}>
              <td className={styles.rankingIndex}>
                <span className={styles.rankingRank} data-medal={medal}>
                  {position + 1}
                </span>
              </td>
              <td>
                <span className={styles.rankingLabel} title={row.destinationUrl || row.label}>
                  {row.label}
                </span>
                <span className={styles.rankingBar} aria-hidden="true">
                  <span style={{ width: `${(safeNumber(row.clicks) / max) * 100}%` }} />
                </span>
              </td>
              <td className={styles.rankingNumber}>{format(row.clicks)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* Sem título nem descrição: só as ações da página. */
function PageHeader({ children }) {
  return (
    <header className={styles.header} data-pdf-section>
      {children}
    </header>
  );
}

function LoadingState() {
  return (
    <div className={styles.loadingState} aria-busy="true" aria-label="Loading">
      <div className={`${styles.skeleton} ${styles.skeletonWide}`} />
      <div className={`${styles.skeleton} ${styles.skeletonWide}`} />
      <div className={styles.loadingColumns}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    </div>
  );
}

/**
 * Página principal de métricas.
 * Carrega dados da API e apresenta os painéis.
 */
export default function AnalyticsPage() {
  const t = useTranslations("Analytics");
  const locale = useLocale();

  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const { stopLoading } = useGlobalLoader();

  const orgId = org?.id;

  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isFullLinksListOpen, setIsFullLinksListOpen] = useState(false);
  const [expandedTrend, setExpandedTrend] = useState(null);
  const [visibleSections, setVisibleSections] = useState(DEFAULT_VISIBLE_SECTIONS);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportNotice, setExportNotice] = useState(null);
  const [metricsOrgId, setMetricsOrgId] = useState(null);
  const exportRef = useRef(null);
  const exportInProgress = useRef(false);
  const isExporting = isExportingPdf || isExportingExcel;
  const canExport = Boolean(metrics && metricsOrgId === orgId && metrics.period?.value === period && !isLoadingMetrics && !error);

  /**
   * Carrega do localStorage as secções que o utilizador quer ver.
   */
  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(SECTION_STORAGE_KEY);
      if (storedValue) {
        setVisibleSections({
          ...DEFAULT_VISIBLE_SECTIONS,
          ...JSON.parse(storedValue),
        });
      }
    } catch (err) {
      console.error("[analytics] Failed to load section preferences:", err);
    } finally {
      setSectionsLoaded(true);
    }
  }, []);

  /**
   * Guarda no localStorage as secções visíveis.
   */
  useEffect(() => {
    if (!sectionsLoaded) return;
    try {
      window.localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(visibleSections));
    } catch (err) {
      console.error("[analytics] Failed to save section preferences:", err);
    }
  }, [visibleSections, sectionsLoaded]);

  useEffect(() => {
    stopLoading();
  }, [stopLoading]);

  /**
   * Fecha os modais com a tecla Escape.
   */
  useEffect(() => {
    if (!isFullLinksListOpen && !expandedTrend) return undefined;

    function handleKey(event) {
      if (event.key === "Escape") {
        setIsFullLinksListOpen(false);
        setExpandedTrend(null);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullLinksListOpen, expandedTrend]);

  const formatter = useMemo(() => new Intl.NumberFormat(locale || "pt-PT"), [locale]);
  const decimalFormatter = useMemo(
    () => new Intl.NumberFormat(locale || "pt-PT", { maximumFractionDigits: 1 }),
    [locale]
  );

  const format = useCallback((value) => formatter.format(safeNumber(value)), [formatter]);
  const decimalFormat = useCallback(
    (value) => decimalFormatter.format(safeNumber(value)),
    [decimalFormatter]
  );

  function toggleSection(key) {
    setVisibleSections((current) => ({ ...current, [key]: !current[key] }));
  }

  function resetSections() {
    setVisibleSections({ ...DEFAULT_VISIBLE_SECTIONS });
  }

  const hasHiddenSections = Object.values(visibleSections).some((value) => !value);
  const toggleLabels = {
    show: t("customization.show"),
    hide: t("customization.hide"),
  };

  /**
   * Carrega métricas da API para a organização e período atual.
   */
  const loadMetrics = useCallback(async () => {
    if (!orgId) return;

    setError("");
    setIsLoadingMetrics(true);

    try {
      const res = await fetch(`/api/analytics/overview?orgId=${orgId}&period=${period}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load analytics.");
      }

      setMetrics(data);
      setMetricsOrgId(orgId);
      setExportNotice(null);
      setUpdatedAt(new Date());
    } catch (err) {
      console.warn("[Analytics] load error:", err);
      setError(t("errors.load"));
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [orgId, period, t]);

  useEffect(() => {
    if (authLoading || orgLoading || !orgId) return;
    loadMetrics();
  }, [authLoading, orgLoading, orgId, loadMetrics]);

  // Dados recebidos da API, separados por grupo.
  const users = metrics?.users ?? {};
  const assistants = metrics?.assistants ?? {};
  const templates = metrics?.templates ?? {};
  const messages = metrics?.messages ?? {};
  const automations = metrics?.automations ?? {};
  const scheduledBroadcasts = metrics?.scheduledBroadcasts ?? {};
  const trackedLinks = metrics?.trackedLinks ?? {};
  const pendingOutreach = metrics?.pendingOutreach ?? {};
  const daily = metrics?.daily ?? {};
  const rankings = metrics?.rankings ?? {};

  const topTrackedLinks = rankings.topTrackedLinks ?? [];
  const dailyMessagesData = daily.messages ?? [];
  const dailyClicksData = daily.clicks ?? [];
  const dailyFailedMessagesData = daily.failedMessages ?? [];
  const dailyAutomationRunsData = daily.automationRuns ?? [];

  // Séries diárias prontas para os gráficos e para o modal de detalhe.
  const trends = [
    {
      key: "messages",
      title: t("trends.messagesTitle"),
      description: t("trends.messagesDescription"),
      points: toPoints(dailyMessagesData, "messages"),
      tone: "brand",
    },
    {
      key: "clicks",
      title: t("trends.clicksTitle"),
      description: t("trends.clicksDescription"),
      points: toPoints(dailyClicksData, "clicks"),
      tone: "brand",
    },
    {
      key: "automations",
      title: t("trends.automationsTitle"),
      description: t("trends.automationsDescription"),
      points: toPoints(dailyAutomationRunsData, "processed"),
      tone: "brand",
    },
    {
      key: "failures",
      title: t("trends.failuresTitle"),
      description: t("trends.failuresDescription"),
      points: toPoints(dailyFailedMessagesData, "failures"),
      tone: "danger",
    },
  ];
  const expandedTrendData = trends.find((trend) => trend.key === expandedTrend) || null;

  // Percentagens calculadas para as células.
  const assistantCoverageRate = safePercent(users.withAssistant, users.total);
  const readRate = safePercent(messages.read, messages.total);
  const failedMessageRate = safePercent(messages.failed, messages.total);
  const clicksPerLink =
    safeNumber(trackedLinks.totalLinks) > 0
      ? safeNumber(trackedLinks.totalClicks) / safeNumber(trackedLinks.totalLinks)
      : 0;
  const activeIssues =
    safeNumber(automations.runsFailed) +
    safeNumber(scheduledBroadcasts.failed) +
    safeNumber(templates.rejected);

  const periodLabel = t(
    PERIOD_OPTIONS.find((option) => option.value === period)?.labelKey || "periods.all"
  );

  async function handleExportPdf() {
    if (!canExport || !exportRef.current || exportInProgress.current) return;
    exportInProgress.current = true;
    setIsExportingPdf(true);
    setExportNotice(null);
    try {
      await exportAnalyticsPdf({
        exportElement: exportRef.current,
        period,
        exportClassName: styles.exportingPdf,
        footerLabel: [t("title"), org?.name, periodLabel].filter(Boolean).join(" - "),
      });
    } catch (err) {
      console.error("[analytics] PDF export failed", err);
      setExportNotice({ tone: "error", message: t("errors.exportPdf") });
    } finally {
      exportInProgress.current = false;
      setIsExportingPdf(false);
    }
  }

  async function handleExportExcel() {
    if (!canExport || exportInProgress.current) return;
    exportInProgress.current = true;
    setIsExportingExcel(true);
    setExportNotice(null);
    try {
      const exportedAt = new Date();
      let detail = null;
      try {
        const response = await fetch(
          "/api/analytics/export?orgId=" + orgId + "&period=" + period,
          { cache: "no-store" },
        );
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.ok) detail = { ...payload, daily };
      } catch (err) {
        console.warn("[analytics] Export detail unavailable", err);
      }
      await exportAnalyticsExcel({
        detail,
        data: { users, assistants, templates, messages, automations, scheduledBroadcasts, trackedLinks, pendingOutreach },
        meta: {
          organizationName: org?.name ?? "",
          periodLabel,
          exportedAt,
          exportedAtLabel: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(exportedAt),
          fileName: buildExcelFileName(period, exportedAt),
          labels: buildExcelLabels(t),
        },
      });
      if (!detail) setExportNotice({ tone: "warning", message: t("errors.exportPartial") });
    } catch (err) {
      console.error("[analytics] Excel export failed", err);
      setExportNotice({ tone: "error", message: t("errors.export") });
    } finally {
      exportInProgress.current = false;
      setIsExportingExcel(false);
    }
  }

  const updatedLabel = updatedAt
    ? t("updatedAt", {
        time: updatedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      })
    : null;

  if (authLoading || orgLoading || (orgId && !metrics && !error)) {
    return (
      <main className={styles.page}>
        <PageHeader />
        <LoadingState />
      </main>
    );
  }

  if (!orgId) {
    return (
      <main className={styles.page}>
        <PageHeader />
        <div className={styles.errorBox}>
          <p>{t("errors.noOrg")}</p>
        </div>
      </main>
    );
  }

  return (
    <main ref={exportRef} data-analytics-pdf-root="true" className={styles.page}>
      <PageHeader>
        <div className={styles.headerActions} data-html2canvas-ignore="true">
          {updatedLabel ? <span className={styles.updatedAt}>{updatedLabel}</span> : null}
          <div className={styles.periodTabs} role="group" aria-label={t("periods.label")}>
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.periodButton} ${
                  period === option.value ? styles.periodButtonActive : ""
                }`}
                onClick={() => setPeriod(option.value)}
                disabled={isLoadingMetrics || isExporting}
                aria-pressed={period === option.value}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleExportPdf}
            disabled={!canExport || isExporting}
          >
            {isExportingPdf ? t("customization.exporting") : t("customization.exportPdf")}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleExportExcel}
            disabled={!canExport || isExporting}
          >
            {isExportingExcel ? t("customization.exporting") : t("customization.exportExcel")}
          </button>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={loadMetrics}
            disabled={isLoadingMetrics || isExporting}
          >
            <RefreshCw size={15} className={isLoadingMetrics ? styles.spin : ""} aria-hidden="true" />
            {t("refresh")}
          </button>
        </div>
      </PageHeader>

      {exportNotice ? (
        <div className={exportNotice.tone === "error" ? styles.errorBox : styles.exportWarning} role={exportNotice.tone === "error" ? "alert" : "status"}>
          <p>{exportNotice.message}</p>
        </div>
      ) : null}

      {hasHiddenSections ? (
        <div className={styles.hiddenNotice}>
          <span>{t("customization.hiddenNotice")}</span>
          <button type="button" onClick={resetSections} disabled={isExporting}>
            {t("customization.resetDashboard")}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className={styles.errorBox} role="alert">
          <p>{error}</p>
          <button type="button" onClick={loadMetrics} disabled={isLoadingMetrics || isExporting}>
            {t("retry")}
          </button>
        </div>
      ) : null}

      {metrics ? (
        <div className={`${styles.content} ${isLoadingMetrics ? styles.contentLoading : ""} ${isExporting ? styles.exportBusy : ""}`} aria-busy={isExporting} inert={isExporting ? true : undefined}>
          <Section
            title={t("groups.overview.title")}
            description={t("groups.overview.description")}
            linkHref="/users"
            linkLabel={t("actions.viewUsers")}
            visible={visibleSections.overview}
            onToggle={() => toggleSection("overview")}
            toggleLabels={toggleLabels}
          >
            <div className={`${styles.stats} ${styles.statsFour}`}>
              <Stat
                label={t("cards.users")}
                value={format(users.total)}
                meta={t("cards.usersHelper", {
                  withAssistant: format(users.withAssistant),
                  withoutAssistant: format(users.withoutAssistant),
                })}
                href="/users"
              />
              <Stat
                label={t("cards.assistantCoverage")}
                value={`${assistantCoverageRate}%`}
                percent={assistantCoverageRate}
                meta={t("cards.assistantCoverageHelper", {
                  withAssistant: format(users.withAssistant),
                  total: format(users.total),
                })}
                href="/users"
              />
              <Stat
                label={t("cards.assistants")}
                value={format(assistants.total)}
                meta={t("cards.assistantsHelper", {
                  withoutOpenAiId: format(assistants.withoutOpenAiId),
                })}
                attention={safeNumber(assistants.withoutOpenAiId) > 0}
                href="/assistants"
              />
              <Stat
                label={t("cards.templates")}
                value={format(templates.total)}
                meta={t("cards.templatesHelper", {
                  active: format(templates.active),
                  pending: format(templates.pending),
                  rejected: format(templates.rejected),
                })}
                attention={safeNumber(templates.rejected) > 0}
                href="/templates"
              />
            </div>
          </Section>

          <Section
            title={t("groups.activity.title")}
            description={t("groups.activity.description", { period: periodLabel })}
            visible={visibleSections.activity}
            onToggle={() => toggleSection("activity")}
            toggleLabels={toggleLabels}
          >
            <div className={`${styles.stats} ${styles.statsFive}`}>
              <Stat
                label={t("cards.messages")}
                value={format(messages.total)}
                meta={t("cards.messagesHelper", {
                  whatsapp: format(messages.whatsapp),
                  teams: format(messages.teams),
                })}
              />
              <Stat
                label={t("cards.delivery")}
                value={format(messages.delivered)}
                meta={t("cards.deliveryHelper", {
                  read: format(messages.read),
                  failed: format(messages.failed),
                })}
                attention={safeNumber(messages.failed) > 0}
              />
              <Stat
                label={t("cards.readRate")}
                value={`${readRate}%`}
                percent={readRate}
                meta={t("cards.readRateHelper", {
                  read: format(messages.read),
                  total: format(messages.total),
                })}
              />
              <Stat
                label={t("cards.failureRate")}
                value={`${failedMessageRate}%`}
                percent={failedMessageRate}
                meta={t("cards.failureRateHelper", {
                  failed: format(messages.failed),
                  total: format(messages.total),
                })}
                attention={failedMessageRate > 0}
              />
              <Stat
                label={t("cards.pendingOutreach")}
                value={format(pendingOutreach.total)}
                meta={t("cards.pendingOutreachHelper", {
                  active: format(pendingOutreach.active),
                })}
              />
            </div>
          </Section>

          <div className={styles.columns} data-pdf-section={visibleSections.automations || visibleSections.engagement ? "" : undefined}>
            <Section
              title={t("groups.automations.title")}
              description={t("groups.automations.description")}
              linkHref="/automations"
              linkLabel={t("actions.viewAutomations")}
              visible={visibleSections.automations}
              onToggle={() => toggleSection("automations")}
              toggleLabels={toggleLabels}
            >
              <div className={`${styles.stats} ${styles.statsThree}`}>
                <Stat
                  label={t("cards.automations")}
                  value={format(automations.rulesTotal)}
                  meta={t("cards.automationsHelper", {
                    active: format(automations.rulesActive),
                    paused: format(automations.rulesPaused),
                  })}
                  href="/automations"
                />
                <Stat
                  label={t("cards.automationRuns")}
                  value={format(automations.runsTotal)}
                  meta={t("cards.automationRunsHelper", {
                    processed: format(automations.runsProcessed),
                    failed: format(automations.runsFailed),
                  })}
                  attention={safeNumber(automations.runsFailed) > 0}
                  href="/automations"
                />
                <Stat
                  label={t("cards.scheduledBroadcasts")}
                  value={format(scheduledBroadcasts.total)}
                  meta={t("cards.scheduledBroadcastsHelper", {
                    queued: format(scheduledBroadcasts.queued),
                    completed: format(scheduledBroadcasts.completed),
                    failed: format(scheduledBroadcasts.failed),
                    recipients: format(scheduledBroadcasts.recipientCount),
                  })}
                  attention={safeNumber(scheduledBroadcasts.failed) > 0}
                  href="/broadcast/scheduled"
                />
              </div>
            </Section>

            <Section
              title={t("groups.engagement.title")}
              description={t("groups.engagement.description")}
              visible={visibleSections.engagement}
              onToggle={() => toggleSection("engagement")}
              toggleLabels={toggleLabels}
            >
              <div className={`${styles.stats} ${styles.statsTwo}`}>
                <Stat
                  label={t("cards.trackedLinks")}
                  value={format(trackedLinks.totalClicks)}
                  meta={t("cards.trackedLinksHelper", {
                    links: format(trackedLinks.totalLinks),
                  })}
                />
                <Stat
                  label={t("cards.clickDensity")}
                  value={decimalFormatter.format(clicksPerLink)}
                  meta={t("cards.clickDensityHelper", {
                    clicks: format(trackedLinks.totalClicks),
                    links: format(trackedLinks.totalLinks),
                  })}
                />
              </div>
            </Section>
          </div>

          <div className={styles.columnsWide} data-pdf-section={visibleSections.distribution || visibleSections.rankings ? "" : undefined}>
            <Section
              title={t("charts.sectionTitle")}
              description={t("charts.sectionDescription")}
              visible={visibleSections.distribution}
              onToggle={() => toggleSection("distribution")}
              toggleLabels={toggleLabels}
            >
              <div className={styles.breakdowns}>
                <Breakdown
                  title={t("charts.messagesTitle")}
                  format={format}
                  emptyMessage={t("charts.empty")}
                  items={[
                    { key: "whatsapp", label: t("charts.whatsapp"), value: messages.whatsapp, tone: "ink" },
                    { key: "teams", label: t("charts.teams"), value: messages.teams, tone: "brand" },
                  ]}
                />
                <Breakdown
                  title={t("charts.templatesTitle")}
                  format={format}
                  emptyMessage={t("charts.empty")}
                  items={[
                    { key: "active", label: t("charts.active"), value: templates.active, tone: "brand" },
                    { key: "pending", label: t("charts.pending"), value: templates.pending, tone: "muted" },
                    { key: "rejected", label: t("charts.rejected"), value: templates.rejected, tone: "danger" },
                  ]}
                />
              </div>
            </Section>

            <Section
              title={t("rankings.topLinksTitle")}
              description={t("rankings.topLinksDescription")}
              visible={visibleSections.rankings}
              onToggle={() => toggleSection("rankings")}
              toggleLabels={toggleLabels}
            >
              {topTrackedLinks.length ? (
                <div className={styles.rankingPanel}>
                  <LinksTable rows={topTrackedLinks.slice(0, 5)} format={format} t={t} />
                  {topTrackedLinks.length > 5 ? (
                    <button
                      type="button"
                      className={styles.rankingMore}
                      onClick={() => setIsFullLinksListOpen(true)}
                    >
                      {t("rankings.viewAllLinks", { count: format(topTrackedLinks.length) })}
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className={styles.emptyState}>{t("rankings.empty")}</p>
              )}
            </Section>
          </div>

          <Section
            title={t("trends.title")}
            description={t("trends.description")}
            visible={visibleSections.trends}
            onToggle={() => toggleSection("trends")}
            toggleLabels={toggleLabels}
          >
            <div className={styles.trendGrid}>
              {trends.map((trend) => (
                <TrendPanel
                  key={trend.key}
                  trend={trend}
                  locale={locale}
                  format={format}
                  t={t}
                  onExpand={() => setExpandedTrend(trend.key)}
                />
              ))}
            </div>
          </Section>

          <Section
            title={t("sections.breakdownTitle")}
            description={t("sections.breakdownDescription")}
            visible={visibleSections.summary}
            onToggle={() => toggleSection("summary")}
            toggleLabels={toggleLabels}
          >
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{t("sections.users.title")}</span>
                <strong className={styles.summaryValue}>
                  {t("sections.users.value", {
                    total: format(users.total),
                    withAssistant: format(users.withAssistant),
                  })}
                </strong>
                <p>
                  {t("sections.users.text", {
                    email: format(users.withEmail),
                    phone: format(users.withPhone),
                    teams: format(users.withTeams),
                    whatsapp: format(users.withWhatsapp),
                  })}
                </p>
              </div>

              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{t("sections.messages.title")}</span>
                <strong className={styles.summaryValue}>
                  {t("sections.messages.value", { total: format(messages.total) })}
                </strong>
                <p>
                  {t("sections.messages.text", {
                    userMessages: format(messages.userMessages),
                    assistantMessages: format(messages.assistantMessages),
                    read: format(messages.read),
                    failed: format(messages.failed),
                  })}
                </p>
              </div>

              <div
                className={`${styles.summaryItem} ${
                  activeIssues > 0 ? styles.summaryAttention : ""
                }`}
              >
                <span className={styles.summaryLabel}>{t("sections.attention.title")}</span>
                <strong className={styles.summaryValue}>
                  {activeIssues > 0
                    ? t("sections.attention.value", { total: format(activeIssues) })
                    : t("health.ok")}
                </strong>
                <p>
                  {activeIssues > 0
                    ? t("sections.attention.text", {
                        automationFailures: format(automations.runsFailed),
                        scheduledFailures: format(scheduledBroadcasts.failed),
                        rejectedTemplates: format(templates.rejected),
                      })
                    : t("health.noErrors")}
                </p>
              </div>
            </div>
          </Section>
        </div>
      ) : null}

      {isFullLinksListOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setIsFullLinksListOpen(false)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("rankings.allLinksTitle")}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.sectionHeader}>
              <div className={styles.sectionCopy}>
                <h2>{t("rankings.allLinksTitle")}</h2>
                <p>{t("rankings.allLinksDescription")}</p>
              </div>
              <button
                type="button"
                className={styles.sectionToggle}
                onClick={() => setIsFullLinksListOpen(false)}
              >
                {t("rankings.close")}
              </button>
            </header>
            <div className={styles.modalBody}>
              <LinksTable rows={topTrackedLinks} format={format} t={t} />
            </div>
          </section>
        </div>
      ) : null}

      {expandedTrendData ? (
        <TrendModal
          trend={expandedTrendData}
          locale={locale}
          format={format}
          decimalFormat={decimalFormat}
          t={t}
          onClose={() => setExpandedTrend(null)}
        />
      ) : null}
    </main>
  );
}
