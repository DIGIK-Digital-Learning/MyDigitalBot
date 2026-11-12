"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { Check, Phone, Video } from "lucide-react";

import styles from "./whatsAppPhone.module.css";

const VariantContext = createContext("whatsapp");

/**
 * Moldura de telemóvel com o aspeto de uma conversa WhatsApp (ou Teams, com
 * `variant="teams"`).
 *
 * Os filhos são as linhas da conversa. Usa WhatsAppBubble para um balão
 * enviado e WhatsAppButton para os botões por baixo do balão. `footer` é a
 * barra inferior, onde no WhatsApp fica a caixa de escrita. `centered` alinha
 * os balões ao centro em vez de à direita (pré-visualizações).
 *
 * #235: a variante Teams imita o Teams como a outra imita o WhatsApp, para se
 * perceber logo em que canal se está: presença no avatar, ícones de vídeo e
 * chamada, separador «Chat», conversa em cinzento-claro e hora por cima do
 * balão.
 */
export default function WhatsAppPhone({
  contactName,
  subtitle,
  compact = false,
  centered = false,
  variant = "whatsapp",
  className = "",
  footer = null,
  children,
}) {
  const t = useTranslations("WhatsAppPhone");
  const initial = (String(contactName || "").trim()[0] || "U").toUpperCase();
  const isTeams = variant === "teams";

  const classes = [
    styles.frame,
    compact ? styles.frameCompact : "",
    centered ? styles.frameCentered : "",
    isTeams ? styles.frameTeams : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const status = subtitle ?? (isTeams ? t("available") : t("online"));

  return (
    <VariantContext.Provider value={variant}>
      <div className={classes} data-testid="whatsapp-phone">
        <div className={styles.header}>
          <div className={styles.avatar}>
            {initial}
            {isTeams ? (
              <span
                className={styles.presence}
                data-testid="teams-presence"
                aria-hidden="true"
              >
                <Check size={7} strokeWidth={4} />
              </span>
            ) : null}
          </div>
          <div className={styles.headerText}>
            <div className={styles.title}>{contactName || t("contact")}</div>
            <div className={styles.subtitle}>{status}</div>
          </div>
          {isTeams && !compact ? (
            <div className={styles.headerActions} aria-hidden="true">
              <Video size={18} />
              <Phone size={16} />
            </div>
          ) : null}
        </div>

        {isTeams && !compact ? (
          <div className={styles.teamsTabs} aria-hidden="true">
            <span className={styles.teamsTabActive}>{t("teamsChat")}</span>
            <span>{t("teamsShared")}</span>
          </div>
        ) : null}

        <div className={styles.chat}>{children}</div>

        {footer ? <div className={styles.bar}>{footer}</div> : null}
      </div>
    </VariantContext.Provider>
  );
}

export function WhatsAppBubble({ time, className = "", children }) {
  const variant = useContext(VariantContext);

  // No Teams a hora das mensagens enviadas fica por cima do balão.
  if (variant === "teams") {
    return (
      <div className={`${styles.rowOut} ${styles.rowTeams}`}>
        {time ? <span className={styles.metaTeams}>{time}</span> : null}
        <div className={`${styles.bubble} ${className}`}>{children}</div>
      </div>
    );
  }

  return (
    <div className={styles.rowOut}>
      <div className={`${styles.bubble} ${className}`}>
        {children}
        {time ? <span className={styles.meta}>{time} ✓✓</span> : null}
      </div>
    </div>
  );
}

export function WhatsAppButton({ children, className = "" }) {
  return (
    <div className={styles.rowOut}>
      <div className={`${styles.button} ${className}`}>{children}</div>
    </div>
  );
}
