"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import styles from "./import.module.css";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import mapCsvRow from "./helpers";
import readUsersWorkbook from "./readUsersWorkbook";
import { Download } from "lucide-react";
import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";
import FilePickerButton from "@/app/components/FilePickerButton/FilePickerButton";

const PREVIEW_LIMIT = 10;

function isExcelFile(file) {
  const name = file?.name?.toLowerCase() || "";

  return (
    name.endsWith(".xlsx") ||
    file?.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function isCsvFile(file) {
  const name = file?.name?.toLowerCase() || "";

  return (
    name.endsWith(".csv") ||
    file?.type === "text/csv" ||
    file?.type === "application/csv"
  );
}

export default function ImportUsersModal({
  isOpen,
  onClose,
  orgId,
  assistants = [],
  defaultPhoneCode = "+351",
  onImported,
}) {
  const t = useTranslations("ImportUsers");
  const promptPlanLimit = usePlanLimitPrompt();
  const [rows, setRows] = useState([]);
  const [assistantId, setAssistantId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const [render, setRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
    } else {
      setRows([]);
      setAssistantId("");
      setIsSubmitting(false);
      setSummary(null);
      setError("");
      setFileName("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!render) return;

    const onKey = (e) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [render, isSubmitting, onClose]);

  const previewRows = useMemo(() => rows.slice(0, PREVIEW_LIMIT), [rows]);

  if (!render) return null;

  const stateClass = isOpen ? styles.open : styles.closing;

  /* Os motivos conhecidos vêm com um código; os outros (erros da base) ficam como vieram. */
  const rowReason = (item) =>
    item.code ? t(`reasons.${item.code}`, { tags: item.tags }) : item.reason;

  async function readExcelFile(file) {
    const ExcelJS = await import("exceljs");

    const buffer = await file.arrayBuffer();
    const rows = await readUsersWorkbook(buffer, ExcelJS);

    if (!rows) {
      throw new Error(t("errors.noSheets"));
    }

    return rows;
  }

  async function readCsvFile(file) {
    const text = await file.text();

    const results = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (results.errors?.length) {
      console.warn("CSV parse warnings:", results.errors);
    }

    return results.data || [];
  }

  async function handleFileChange(file) {
    if (!file) return;

    setError("");
    setSummary(null);
    setFileName(file.name);

    try {
      let data = [];

      if (isExcelFile(file)) {
        data = await readExcelFile(file);
      } else if (isCsvFile(file)) {
        data = await readCsvFile(file);
      } else {
        setRows([]);
        setError(t("errors.fileType"));
        return;
      }

      const mapped = data
        .map((row) => {
          const mappedRow = mapCsvRow(
            row,
            defaultPhoneCode,
            assistantId || null,
          );

          if (!mappedRow.assistantId && mappedRow.assistantPosition) {
            const ids = String(mappedRow.assistantPosition)
              .split(/[;|]/)
              .map((position) => assistants[Number(position) - 1]?.id)
              .filter(Boolean);

            mappedRow.assistantId = ids.length ? ids.join(";") : null;
          }

          return mappedRow;
        })
        .filter(
          (row) =>
            row.name ||
            row.email ||
            row.phoneNumber ||
            row.teamsAadObjectId ||
            row.tags?.length,
        );

      if (!mapped.length) {
        setRows([]);
        setError(t("errors.noRows"));
        return;
      }

      setRows(mapped);
    } catch (err) {
      console.error(err);
      setRows([]);
      setError(t("errors.readFailed"));
    }
  }

  async function handleImport() {
    if (!rows.length || !orgId) return;

    setIsSubmitting(true);
    setSummary(null);
    setError("");

    try {
      const payload = rows.map((row) => ({
        ...row,
        assistantId: assistantId || row.assistantId || null,
      }));

      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          users: payload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        /* A Demo terminou (#209): aviso com "Ativar plano". */
        if (await promptPlanLimit(data)) return;

        setError(data.error || t("errors.importFailed"));
        return;
      }

      setSummary(data);
      await onImported?.();
    } catch (err) {
      console.error(err);
      setError(t("errors.importFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`${styles.modalOverlay} ${stateClass}`}
      onAnimationEnd={(e) => {
        if (!isOpen && e.target === e.currentTarget) setRender(false);
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className={`${styles.modalContent} ${stateClass} ${styles.modalContentWide}`}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{t("title")}</h3>

          <a
            href="/templates/user_import_template.xlsx"
            download="user_import_template.xlsx"
            className={styles.templateDownloadButton}
          >
            <Download />
            {t("template")}
          </a>
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="importFile">{t("file")}</label>

            {/* O nome escolhido já aparece por baixo ("selectedFile"). */}
            <FilePickerButton
              id="importFile"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              disabled={isSubmitting}
              showStatus={false}
            />

            {fileName ? (
              <div className={styles.helperText}>
                {t("selectedFile", { name: fileName })}
              </div>
            ) : (
              <div className={styles.helperText}>{t("fileHelp")}</div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>{t("assistant")}</label>
            <PillSelect
              options={assistants.map((a) => ({ value: a.id, label: a.name }))}
              value={assistantId ?? ""}
              onChange={(value) => setAssistantId(value)}
              placeholder={t("chooseAssistant")}
              fullWidth
              portalToBody
            />
            <div className={styles.helperText}>{t("assistantHelp")}</div>
          </div>

          <div className={styles.sectionDivider}>
            <span className={styles.sectionDividerLabel}>
              {t("previewSection")}
            </span>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          {!rows.length && !error ? (
            <div className={styles.emptyState}>{t("empty")}</div>
          ) : null}

          {rows.length > 0 && (
            <div className={styles.previewCard}>
              <div className={styles.previewTop}>
                <div>
                  <div className={styles.previewTitle}>{t("preview")}</div>
                  <div className={styles.previewText}>
                    {t("ready", { count: rows.length })}
                  </div>
                </div>
                <span className={styles.previewBadge}>
                  {t("showing", {
                    shown: Math.min(rows.length, PREVIEW_LIMIT),
                    total: rows.length,
                  })}
                </span>
              </div>

              <div className={styles.previewTable}>
                <div className={`${styles.previewRow} ${styles.previewHead}`}>
                  <div>{t("columns.name")}</div>
                  <div>{t("columns.email")}</div>
                  <div>{t("columns.teams")}</div>
                  <div>{t("columns.phone")}</div>
                  <div>{t("columns.assistant")}</div>
                  <div>{t("columns.tags")}</div>
                </div>

                {previewRows.map((row, index) => (
                  <div
                    key={`${
                      row.email ||
                      row.teamsAadObjectId ||
                      row.phoneNumber ||
                      row.name ||
                      "row"
                    }-${index}`}
                    className={styles.previewRow}
                  >
                    <div>{row.name || "—"}</div>
                    <div>{row.email || "—"}</div>
                    <div>{row.teamsAadObjectId || "—"}</div>
                    <div>{row.phoneNumber || "—"}</div>
                    <div>
                      {assistantId ||
                        row.assistantId ||
                        row.assistantPosition ||
                        "—"}
                    </div>
                    <div>{row.tags?.length ? row.tags.join(", ") : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary ? (
            <>
              <div className={styles.sectionDivider}>
                <span className={styles.sectionDividerLabel}>
                  {t("resultSection")}
                </span>
              </div>

              <div className={styles.summaryBox}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {t("result.created")}
                    </span>
                    <strong>{summary.created || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {t("result.updated")}
                    </span>
                    <strong>{summary.updated || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {t("result.skipped")}
                    </span>
                    <strong>{summary.skipped || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {t("result.failed")}
                    </span>
                    <strong>{summary.failed || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>
                      {t("result.received")}
                    </span>
                    <strong>{summary.totalReceived || 0}</strong>
                  </div>
                </div>

                {!!summary.skippedRows?.length && (
                  <div className={styles.resultList}>
                    <h5 className={styles.resultHeading}>{t("skippedRows")}</h5>
                    {summary.skippedRows.slice(0, 10).map((item, i) => (
                      <div key={i} className={styles.resultRow}>
                        {t("row", { row: item.row, reason: rowReason(item) })}
                        {item.name ? ` - ${item.name}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {!!summary.failedRows?.length && (
                  <div className={styles.resultList}>
                    <h5 className={styles.resultHeading}>{t("failedRows")}</h5>
                    {summary.failedRows.slice(0, 10).map((item, i) => (
                      <div key={i} className={styles.resultRow}>
                        {t("row", { row: item.row, reason: rowReason(item) })}
                        {item.name ? ` - ${item.name}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          <div className={styles.buttonGroup}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              {t("close")}
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={handleImport}
              disabled={!rows.length || isSubmitting}
            >
              {isSubmitting ? t("importing") : t("submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
