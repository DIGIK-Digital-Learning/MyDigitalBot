"use client";

import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";

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

  const classes = [
    styles.frame,
    compact ? styles.frameCompact : "",
    centered ? styles.frameCentered : "",
    variant === "teams" ? styles.frameTeams : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const status =
    subtitle ?? (variant === "teams" ? t("available") : t("online"));

  return (
    <VariantContext.Provider value={variant}>
      <div className={classes} data-testid="whatsapp-phone">
        <div className={styles.header}>
          <div className={styles.avatar}>{initial}</div>
          <div className={styles.headerText}>
            <div className={styles.title}>{contactName || t("contact")}</div>
            <div className={styles.subtitle}>{status}</div>
          </div>
        </div>

        <div className={styles.chat}>{children}</div>

        {footer ? <div className={styles.bar}>{footer}</div> : null}
      </div>
    </VariantContext.Provider>
  );
}

export function WhatsAppBubble({ time, className = "", children }) {
  const variant = useContext(VariantContext);

  return (
    <div className={styles.rowOut}>
      <div className={`${styles.bubble} ${className}`}>
        {children}
        {time ? (
          <span className={styles.meta}>
            {time}
            {variant === "teams" ? "" : " ✓✓"}
          </span>
        ) : null}
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
