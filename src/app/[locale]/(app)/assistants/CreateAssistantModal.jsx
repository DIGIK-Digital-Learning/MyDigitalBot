"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./assistants.module.css";
import { useTranslations } from "next-intl";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import CharCounter from "@/app/components/CharCounter/CharCounter";
import { limitKeepingCurrent } from "@/lib/plans/limitRules";
import PresetPicker from "./PresetPicker";
import {
  DEFAULT_ASSISTANT_PRESET,
  getAssistantPreset,
} from "./assistantPresets";

export default function CreateAssistantModal({
  orgId,
  isOpen,
  onClose,
  onCreated,
}) {
  const translation = useTranslations();
  const showAlert = useAlert();
  const promptPlanLimit = usePlanLimitPrompt();
  const { limits } = usePlanLimits(orgId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  /* Instruções (#185): um assistente novo tem o limite do plano. */
  const instructionsLimit = limitKeepingCurrent(
    limits?.assistantInstructionChars,
  );
  const instructionsTooLong =
    instructionsLimit !== null && instructions.length > instructionsLimit;
  /**
   * A predefinição escolhida.
   *
   * O modelo deixou de ser escolhido aqui: fica no valor por omissão e
   * muda-se na edição, onde quem já conhece o assistente o pode afinar.
   */
  const [preset, setPreset] = useState(DEFAULT_ASSISTANT_PRESET);
  // O modelo com que os assistentes nascem. Alterável na edição.
  const DEFAULT_MODEL = "gpt-5.6-luna";
  /**
   * Um pedido de cada vez. A ref trava os cliques seguidos, que chegam
   * antes de o botão aparecer desativado; o estado desativa o botão.
   */
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [isOpen, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      await createAssistant();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function createAssistant() {
    const res = await fetch("/api/assistants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId, // or dynamic
        name: name,
        description: description,
        instructions: instructions,
        model: DEFAULT_MODEL,
        top_p: getAssistantPreset(preset).top_p,
        temperature: getAssistantPreset(preset).temperature,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));

      /* Limite do plano: aviso com o botão "Atualizar plano". */
      if (await promptPlanLimit(error)) return;

      /* Instruções longas demais (#185): aviso simples, só com OK. */
      if (error?.code === "INSTRUCTIONS_TOO_LONG") {
        await showAlert({
          title: translation("Plans.limits.instructionsTitle"),
          message: translation("Plans.limits.instructions", {
            limit: error.limit,
          }),
          tone: "warning",
        });
        return;
      }

      await showAlert({
        title: translation("CreateAssistant.createFailed"),
        message: error?.error || "",
        tone: "danger",
      });
      return;
    }

    // all good
    onCreated(); // let parent refresh the list
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>
          {translation("CreateAssistant.title")}
        </h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label>
              {translation("CreateAssistant.name")}
              <span
                className={styles.infoIcon}
                data-tooltip={translation("CreateAssistant.nameHelp")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
           10-4.48 10-10S17.52 2 12 2zm0 18c-4.41
           0-8-3.59-8-8s3.59-8 8-8 8 3.59 8
           8-3.59 8-8 8zm-1-13h2v2h-2zm0
           4h2v6h-2z"
                  />
                </svg>
              </span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label>
              {translation("CreateAssistant.description")}
              <span
                className={styles.infoIcon}
                data-tooltip={translation("CreateAssistant.descriptionHelp")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
           10-4.48 10-10S17.52 2 12 2zm0 18c-4.41
           0-8-3.59-8-8s3.59-8 8-8 8 3.59 8
           8-3.59 8-8 8zm-1-13h2v2h-2zm0
           4h2v6h-2z"
                  />
                </svg>
              </span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label>
              {translation("CreateAssistant.instructions")}
              <span
                className={styles.infoIcon}
                data-tooltip={translation("CreateAssistant.instructionsHelp")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
           10-4.48 10-10S17.52 2 12 2zm0 18c-4.41
           0-8-3.59-8-8s3.59-8 8-8 8 3.59 8
           8-3.59 8-8 8zm-1-13h2v2h-2zm0
           4h2v6h-2z"
                  />
                </svg>
              </span>
            </label>
            <textarea
              rows={8}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <CharCounter
              length={instructions.length}
              limit={instructionsLimit}
            />
          </div>
          <div className={styles.formGroup}>
            <label>
              {translation("CreateAssistant.presetLabel")}
              <span
                className={styles.infoIcon}
                data-tooltip={translation("CreateAssistant.presetHelp")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
           10-4.48 10-10S17.52 2 12 2zm0 18c-4.41
           0-8-3.59-8-8s3.59-8 8-8 8 3.59 8
           8-3.59 8-8 8zm-1-13h2v2h-2zm0
           4h2v6h-2z"
                  />
                </svg>
              </span>
            </label>

            <PresetPicker
              name="create-assistant-preset"
              value={preset}
              onChange={setPreset}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button type="submit" disabled={submitting || instructionsTooLong}>
              {translation("CreateAssistant.create")}
            </button>
            <button type="button" onClick={onClose}>
              {translation("Common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
