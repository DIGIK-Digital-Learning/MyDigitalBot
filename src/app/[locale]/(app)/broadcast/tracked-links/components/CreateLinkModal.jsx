"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAlert } from "@/app/components/Alert/AlertProvider";
import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";
import { isAllowedDestinationUrl } from "@/lib/security/destinationUrl";

import styles from "./createLinkModal.module.css";

/* Os mesmos máximos do servidor (POST /api/tracked-links/library). */
export const LABEL_MAX = 100;
export const URL_MAX = 2048;

/**
 * Janela "Criar link" da página dos links: nome e destino. O link fica na
 * lista "Links criados" e no "Enviar mensagem", sem ser preciso enviá-lo.
 * `onCreated` recebe `{ created }`: false quando o link já existia.
 */
export default function CreateLinkModal({ orgId, open, onClose, onCreated }) {
  const translation = useTranslations();
  const showAlert = useAlert();
  const promptPlanLimit = usePlanLimitPrompt();
  const titleId = useId();
  const urlId = useId();
  const urlHelpId = useId();
  const nameRef = useRef(null);

  const [label, setLabel] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [urlTouched, setUrlTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Cada vez que abre, começa vazia e com o cursor no nome. */
  useEffect(() => {
    if (!open) return;

    setLabel("");
    setDestinationUrl("");
    setUrlTouched(false);
    setSaving(false);
    nameRef.current?.focus();
  }, [open]);

  /* Esc fecha, se não estiver a gravar. */
  useEffect(() => {
    if (!open) return;

    function onKey(event) {
      if (event.key === "Escape" && !saving) onClose();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const trimmedLabel = label.trim();
  const trimmedUrl = destinationUrl.trim();
  const urlValid = isAllowedDestinationUrl(trimmedUrl);
  const showUrlError = urlTouched && trimmedUrl !== "" && !urlValid;
  const canSave = Boolean(trimmedLabel) && urlValid && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) {
      setUrlTouched(true);
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/tracked-links/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          label: trimmedLabel,
          destinationUrl: trimmedUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaving(false);

        /* Demo terminada: o aviso com "Ativar plano". */
        if (await promptPlanLimit(data)) return;

        if (data?.code === "TRACKED_LINKS_LIMIT_REACHED") {
          await showAlert({
            title: translation("Plans.limits.trackedLinksTitle"),
            message: translation("TrackedLinks.create.full", {
              limit: data.limit,
            }),
            tone: "warning",
          });
          return;
        }

        await showAlert({
          title: translation("TrackedLinks.create.failedTitle"),
          message:
            data?.code === "TRACKED_LINK_INVALID_URL"
              ? translation("TrackedLinks.create.invalidUrl")
              : translation("TrackedLinks.create.failedMessage"),
          tone: "danger",
        });
        return;
      }

      onClose();
      onCreated?.({ created: Boolean(data?.created) });

      if (!data?.created) {
        await showAlert({
          title: translation("TrackedLinks.create.existsTitle"),
          message: translation("TrackedLinks.create.existsMessage"),
          tone: "default",
        });
      }
    } catch {
      setSaving(false);
      await showAlert({
        title: translation("TrackedLinks.create.failedTitle"),
        message: translation("TrackedLinks.create.failedMessage"),
        tone: "danger",
      });
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {translation("TrackedLinks.create.title")}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={saving}
            aria-label={translation("Common.close")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className={styles.description}>
          {translation("TrackedLinks.create.description")}
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>
              {translation("TrackedLinks.create.labelField")}
            </span>
            <input
              ref={nameRef}
              className={styles.input}
              value={label}
              maxLength={LABEL_MAX}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={translation("TrackedLinks.create.labelPlaceholder")}
              required
            />
          </label>

          {/* A ajuda fica fora do <label>, para não entrar no nome do campo. */}
          <div className={styles.field}>
            <label htmlFor={urlId} className={styles.label}>
              {translation("TrackedLinks.create.urlField")}
            </label>
            <input
              id={urlId}
              className={`${styles.input} ${
                showUrlError ? styles.inputError : ""
              }`}
              type="url"
              inputMode="url"
              value={destinationUrl}
              maxLength={URL_MAX}
              onChange={(event) => setDestinationUrl(event.target.value)}
              onBlur={() => setUrlTouched(true)}
              placeholder={translation("TrackedLinks.create.urlPlaceholder")}
              aria-invalid={showUrlError}
              aria-describedby={urlHelpId}
              required
            />
            <span
              id={urlHelpId}
              className={showUrlError ? styles.error : styles.help}
            >
              {showUrlError
                ? translation("TrackedLinks.create.invalidUrl")
                : translation("TrackedLinks.create.urlHelp")}
            </span>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={onClose}
              disabled={saving}
            >
              {translation("Common.cancel")}
            </button>
            <button
              type="submit"
              className={styles.primary}
              disabled={!canSave}
            >
              {saving
                ? translation("TrackedLinks.create.saving")
                : translation("TrackedLinks.create.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
