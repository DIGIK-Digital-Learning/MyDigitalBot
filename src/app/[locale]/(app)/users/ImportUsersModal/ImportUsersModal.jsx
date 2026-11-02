"use client";

import { useMemo, useState, useEffect } from "react";
import Papa from "papaparse";
import styles from "./import.module.css";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import mapCsvRow from "./helpers";
import { Download } from "lucide-react";
import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";

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

  async function readExcelFile(file) {
    const XLSX = await import("xlsx");

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: false,
    });

    const sheetName = workbook.SheetNames.includes("Users")
      ? "Users"
      : workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error("No sheets found in Excel file.");
    }

    const worksheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json(worksheet, {
      defval: "",
      raw: false,
    });
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
        setError("Please upload a .xlsx or .csv file.");
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
        setError("No valid rows were found in that file.");
        return;
      }

      setRows(mapped);
    } catch (err) {
      console.error(err);
      setRows([]);
      setError("There was a problem reading that file.");
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

        setError(data.error || "Import failed.");
        return;
      }

      setSummary(data);
      await onImported?.();
    } catch (err) {
      console.error(err);
      setError("Import failed.");
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
          <h3 className={styles.modalTitle}>Import users</h3>

          <a
            href="/templates/user_import_template.xlsx"
            download="user_import_template.xlsx"
            className={styles.templateDownloadButton}
          >
            <Download />
            Template
          </a>
        </div>

        <div className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="importFile">Import file</label>

            <input
              id="importFile"
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              disabled={isSubmitting}
            />

            {fileName ? (
              <div className={styles.helperText}>Selected file: {fileName}</div>
            ) : (
              <div className={styles.helperText}>
                Upload an Excel file from the provided template, or a CSV with
                the same columns.
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>Default Assistant</label>
            <PillSelect
              options={assistants.map((a) => ({ value: a.id, label: a.name }))}
              value={assistantId ?? ""}
              onChange={(value) => setAssistantId(value)}
              placeholder="Choose Assistant"
              fullWidth
              portalToBody
            />
            <div className={styles.helperText}>
              If you choose one here, it will be assigned to every imported
              user.
            </div>
          </div>

          <div className={styles.sectionDivider}>
            <span className={styles.sectionDividerLabel}>Import Preview</span>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          {!rows.length && !error ? (
            <div className={styles.emptyState}>
              Upload a file to preview the users before importing.
            </div>
          ) : null}

          {rows.length > 0 && (
            <div className={styles.previewCard}>
              <div className={styles.previewTop}>
                <div>
                  <div className={styles.previewTitle}>Preview</div>
                  <div className={styles.previewText}>
                    {rows.length} row{rows.length === 1 ? "" : "s"} ready to
                    import
                  </div>
                </div>
                <span className={styles.previewBadge}>
                  Showing {Math.min(rows.length, PREVIEW_LIMIT)} / {rows.length}
                </span>
              </div>

              <div className={styles.previewTable}>
                <div className={`${styles.previewRow} ${styles.previewHead}`}>
                  <div>Name</div>
                  <div>Email</div>
                  <div>Teams AAD Object ID</div>
                  <div>Phone</div>
                  <div>Assistant</div>
                  <div>Tags</div>
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
                  Import Result
                </span>
              </div>

              <div className={styles.summaryBox}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Created</span>
                    <strong>{summary.created || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Updated</span>
                    <strong>{summary.updated || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Skipped</span>
                    <strong>{summary.skipped || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Failed</span>
                    <strong>{summary.failed || 0}</strong>
                  </div>

                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Received</span>
                    <strong>{summary.totalReceived || 0}</strong>
                  </div>
                </div>

                {!!summary.skippedRows?.length && (
                  <div className={styles.resultList}>
                    <h5 className={styles.resultHeading}>Skipped rows</h5>
                    {summary.skippedRows.slice(0, 10).map((item, i) => (
                      <div key={i} className={styles.resultRow}>
                        Row {item.row}: {item.reason}
                        {item.name ? ` - ${item.name}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {!!summary.failedRows?.length && (
                  <div className={styles.resultList}>
                    <h5 className={styles.resultHeading}>Failed rows</h5>
                    {summary.failedRows.slice(0, 10).map((item, i) => (
                      <div key={i} className={styles.resultRow}>
                        Row {item.row}: {item.reason}
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
              Close
            </button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={handleImport}
              disabled={!rows.length || isSubmitting}
            >
              {isSubmitting ? "Importing..." : "Import users"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
