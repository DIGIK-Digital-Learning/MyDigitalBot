"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { mediaForPicker, toComposerFile } from "../lib/mediaPicker";
import styles from "./mediaPicker.module.css";

function formatBytes(bytes) {
  const n = Number(bytes) || 0;

  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;

  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(name) {
  const parts = String(name || "").split(".");

  return parts.length > 1 ? parts.pop().slice(0, 4).toUpperCase() : "";
}

/**
 * Janela para juntar à mensagem ficheiros que já estão na multimédia, do tipo
 * escolhido no menu "+" (kind). A lista é pedida sempre que a janela abre.
 */
export default function MediaPickerModal({
  kind,
  orgId,
  attachedUrls = [],
  onAdd,
  onClose,
  translation,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!orgId) return;

    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/media?orgId=${orgId}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data?.error || "Failed to load media.");
        if (!alive) return;

        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch {
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [orgId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const available = useMemo(
    () => mediaForPicker(items, kind, attachedUrls),
    [items, kind, attachedUrls],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return available;

    return available.filter((item) =>
      String(item.name || "").toLowerCase().includes(term),
    );
  }, [available, q]);

  function toggle(item) {
    if (item.attached) return;

    setSelected((prev) =>
      prev.includes(item.url)
        ? prev.filter((url) => url !== item.url)
        : [...prev, item.url],
    );
  }

  async function confirm() {
    const chosen = available.filter((item) => selected.includes(item.url));
    if (!chosen.length) return;

    /*
     * Quem junta pode recusar (ex.: limite de ficheiros por mensagem, #187):
     * nesse caso a janela fica aberta, com a seleção, para se desmarcar.
     */
    const accepted = await onAdd(chosen.map(toComposerFile));
    if (accepted === false) return;

    onClose();
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
      >
        <div className={styles.head}>
          <h2 id="media-picker-title" className={styles.title}>
            {translation(`Broadcast.mediaPicker.title.${kind}`)}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={translation("Broadcast.mediaPicker.close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <Search size={16} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={translation("Broadcast.mediaPicker.search")}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.message}>
              {translation("Broadcast.mediaPicker.loading")}
            </p>
          ) : error ? (
            <p className={`${styles.message} ${styles.error}`}>
              {translation("Broadcast.mediaPicker.loadFailed")}
            </p>
          ) : filtered.length === 0 ? (
            <p className={styles.message}>
              {translation(
                q.trim()
                  ? "Broadcast.mediaPicker.noMatches"
                  : "Broadcast.mediaPicker.empty",
              )}
            </p>
          ) : (
            <div className={styles.grid}>
              {filtered.map((item) => {
                const isSelected = selected.includes(item.url);

                return (
                  <button
                    key={item.url}
                    type="button"
                    className={`${styles.tile} ${isSelected ? styles.tileSelected : ""}`}
                    onClick={() => toggle(item)}
                    disabled={item.attached}
                    aria-pressed={isSelected}
                    title={item.name}
                  >
                    <span className={styles.preview}>
                      {kind === "image" ? (
                        <img src={item.url} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.ext}>
                          {fileExtension(item.name)}
                        </span>
                      )}
                      {isSelected ? (
                        <span className={styles.check}>
                          <Check size={14} aria-hidden />
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.meta}>
                      {item.attached
                        ? translation("Broadcast.mediaPicker.attached")
                        : formatBytes(item.size)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {translation("Common.cancel")}
          </button>
          <button
            type="button"
            className={styles.add}
            onClick={confirm}
            disabled={selected.length === 0}
          >
            {translation("Broadcast.mediaPicker.add", {
              count: selected.length,
            })}
          </button>
        </div>
      </div>
    </div>
  );
}
