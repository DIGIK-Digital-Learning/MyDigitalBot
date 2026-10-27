"use client";

import { useState } from "react";
import { X } from "lucide-react";

import styles from "../scheduled.module.css";
import { visibleMessageLength } from "@/lib/plans/messageLimits";

/*
 * Editar o texto de uma mensagem da corrente. Só o texto: ficheiros, imagens,
 * links e o tempo entre mensagens ficam como estão.
 */
export default function ChainStepEditModal({
  step,
  isOpen,
  onClose,
  onSave,
  saving = false,
  charLimit = null,
  translation,
}) {
  const [message, setMessage] = useState(step.message || "");

  const length = visibleMessageLength(message);
  const tooLong = charLimit !== null && length > charLimit;
  const empty = !message.trim() && !step.fileCount;
  const hasLinks = /\{\{link\./.test(step.message || "");

  function handleSubmit(event) {
    event.preventDefault();
    if (tooLong || empty || saving) return;
    onSave(message);
  }

  return (
    <div
      className={`${styles.modalOverlay} ${
        isOpen ? styles.overlayOpen : styles.overlayClosing
      }`}
      onMouseDown={onClose}
    >
      <div
        className={`${styles.modal} ${
          isOpen ? styles.modalOpen : styles.modalClosing
        }`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>
              {translation("Chain.editModal.title", { index: step.index })}
            </h2>
            <p className={styles.modalSubtitle}>
              {translation("Chain.editModal.hint")}
            </p>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
          >
            <X aria-hidden />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>{translation("Chain.editModal.label")}</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={styles.textarea}
              rows={7}
              autoFocus
            />
          </label>

          {hasLinks ? (
            <p className={styles.sectionHint}>
              {translation("Chain.editModal.linksHint")}
            </p>
          ) : null}

          {charLimit !== null ? (
            <p
              className={`${styles.sectionHint} ${
                tooLong ? styles.chainEditError : ""
              }`}
            >
              {translation("Chain.editModal.chars", {
                count: length,
                limit: charLimit,
              })}
              {tooLong ? ` · ${translation("Chain.editModal.tooLong")}` : ""}
            </p>
          ) : null}

          {empty ? (
            <p className={`${styles.sectionHint} ${styles.chainEditError}`}>
              {translation("Chain.editModal.empty")}
            </p>
          ) : null}

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
            >
              {translation("Chain.editModal.cancel")}
            </button>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={saving || tooLong || empty}
            >
              {saving
                ? translation("Chain.editModal.saving")
                : translation("Chain.editModal.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
