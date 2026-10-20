// components/CreateUserModal.jsx
"use client";
import { useState, useEffect } from "react";
import styles from "./users.module.css";
import PillSelect from "@/app/components/PillSelect/PillSelect";
import AssistantsField from "./AssistantsField";
import { useTranslations } from "next-intl";
import phoneCountryCodes from "../../../../messages/phoneCountryCodes.json";
import { useAlert } from "@/app/components/Alert/AlertProvider";

const PHONE_CODE_OPTIONS = phoneCountryCodes.map((c) => ({
  value: c.code,
  label: `${c.code} (${c.iso2})`,
}));

export default function CreateUserModal({
  isOpen,
  onClose,
  onCreateUser,
  assistants = [],
  defaultPhoneCode = "+351",
}) {
  const translation = useTranslations();
  const alert = useAlert();
  const [userName, setUserName] = useState("");
  const [phoneCode, setPhoneCode] = useState(defaultPhoneCode);
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [assistantId, setAssistantId] = useState(null);
  const [assistantIds, setAssistantIds] = useState([]);

  const [teamsAadObjectId, setTeamsAadObjectId] = useState("");
  const [teamsFromId, setTeamsFromId] = useState("");

  const [whatsAppStatus, setWhatsAppStatus] = useState("enabled");
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keep the modal mounted while running the closing animation
  const [render, setRender] = useState(isOpen);
  useEffect(() => {
    if (isOpen) {
      setRender(true);
      setPhoneCode(defaultPhoneCode || "+351");
    }
  }, [isOpen, defaultPhoneCode]);

  // ESC to close (only when open)
  useEffect(() => {
    if (!render) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [render, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const hasPhone = Boolean(phoneNational.trim());
      const hasTeams = Boolean(teamsAadObjectId.trim() || teamsFromId.trim());
      const hasEmail = Boolean(email.trim());

      if (!hasPhone && !hasTeams && !hasEmail) {
        await alert({
          title: translation("Alert.noContact.title"),
          message: translation("Alert.noContact.message"),
          buttonText: translation("Alert.noContact.ok"),
        });
        return;
      }

      const result = await onCreateUser({
        userName,
        phoneCode,
        phoneNational,
        email,
        assistantId: assistantId ?? null,
        assistantIds,
        teamsAadObjectId: teamsAadObjectId || null,
        teamsFromId: teamsFromId || null,
      });

      /*
       * Quem cria (a página) já mostrou o aviso do erro: o do limite do plano
       * só quando é o limite, os outros com a mensagem deles. O formulário
       * fica aberto com os dados para se corrigir.
       */
      if (!result?.ok) return;

      if (result.ok) {
        // only clear if the API call succeeded
        setUserName("");
        setPhoneCode(defaultPhoneCode || "+351");
        setPhoneNational("");
        setEmail("");
        setAssistantId(null);
        setAssistantIds([]);
        setTeamsAadObjectId("");
        setTeamsFromId("");
        setWhatsAppStatus("enabled");
        setWhatsAppOpen(false);
        setTeamsOpen(false);
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!render) return null;

  const stateClass = isOpen ? styles.open : styles.closing;

  return (
    <div
      className={`${styles.modalOverlay} ${stateClass}`}
      onAnimationEnd={(e) => {
        if (!isOpen && e.target === e.currentTarget) setRender(false);
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${styles.modalContent} ${styles.modalContentForm} ${stateClass}`}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.formHead}>
          <h3>{translation("CreateUserModal.title")}</h3>
        </div>

        <form onSubmit={handleSubmit} className={styles.formShell}>
        <div className={styles.formBody}>
          <div className={styles.formCol}>
            <div className={styles.formGroup}>
              <label htmlFor="nome">
                {translation("CreateUserModal.userName")}
              </label>
              <input
                id="nome"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email">
                {translation("CreateUserModal.email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>


          {/* ───── Canais de Comunicação (accordion) ───── */}
          <div className={styles.sectionDivider}>
            <span className={styles.sectionDividerLabel}>
              {translation("CreateUserModal.communicationChannels")}
            </span>
          </div>

          <div className={styles.channelList}>
            {/* WhatsApp row */}
            <div className={styles.channelRow}>
              <button
                type="button"
                className={styles.channelMain}
                onClick={() => setWhatsAppOpen((v) => !v)}
              >
                <div className={styles.channelMainLeft}>
                  <span className={styles.channelLabel}>WhatsApp</span>
                </div>
                <div className={styles.channelMainRight}>
                  <span
                    className={`${styles.channelChevron} ${
                      whatsAppOpen ? styles.channelChevronOpen : ""
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        d="M9 6l6 6-6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </button>

              {whatsAppOpen && (
                <div className={styles.channelFields}>
                  <div className={styles.formGroup}>
                    <label htmlFor="telefone">
                      {translation("CreateUserModal.phone")}
                    </label>
                    <div className={styles.phoneRow}>
                      <PillSelect
                        options={PHONE_CODE_OPTIONS}
                        value={phoneCode}
                        onChange={(val) => setPhoneCode(val)}
                        className={styles.phoneCodeSelect}
                        portalToBody
                        menuWidth={135}
                      />
                      <input
                        id="telefone"
                        type="text"
                        value={phoneNational}
                        onChange={(e) => setPhoneNational(e.target.value)}
                        required
                        placeholder="912 345 678"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Microsoft Teams row */}
            <div className={styles.channelRow}>
              <button
                type="button"
                className={styles.channelMain}
                onClick={() => setTeamsOpen((v) => !v)}
              >
                <div className={styles.channelMainLeft}>
                  <span className={styles.channelLabel}>Microsoft Teams</span>
                </div>
                <div className={styles.channelMainRight}>
                  <span
                    className={`${styles.channelChevron} ${
                      teamsOpen ? styles.channelChevronOpen : ""
                    }`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path
                        d="M9 6l6 6-6 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              </button>

              {teamsOpen && (
                <div className={styles.channelFields}>
                  <div className={styles.formGroup}>
                    <label>Teams Aad Object ID</label>
                    <input
                      value={teamsAadObjectId}
                      onChange={(e) => setTeamsAadObjectId(e.target.value)}
                      placeholder="00000000-0000-0000-0000-000000000000"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label>Teams From Id</label>
                    <input
                      value={teamsFromId}
                      onChange={(e) => setTeamsFromId(e.target.value)}
                      placeholder="29:XXXXXXXXXXXX"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>

          <div className={styles.formCol}>
          <AssistantsField
            assistants={assistants}
            assistantIds={assistantIds}
            activeAssistantId={assistantId}
            onChange={(next) => {
              setAssistantIds(next.assistantIds);
              setAssistantId(next.activeAssistantId);
            }}
          />
          </div>
        </div>

          <div className={`${styles.buttonGroup} ${styles.formFoot}`}>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              {translation("CreateUserModal.cancel")}
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? translation("CreateUserModal.creating")
                : translation("CreateUserModal.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
