"use client";

import { ExternalLink, X } from "lucide-react";
import {
  WhatsAppBubble,
  WhatsAppButton,
} from "@/app/components/WhatsAppPhone/WhatsAppPhone";

import styles from "../broadcast.module.css";

/* Botão de link como o contacto o vê, com o x para tirar o link. */
function LinkButton({ id, buttonText, onRemove, translation }) {
  return (
    <WhatsAppButton className={styles.linkButton}>
      <ExternalLink size={14} aria-hidden="true" />
      {buttonText}

      {id && onRemove ? (
        <button
          type="button"
          className={styles.linkButtonRemove}
          aria-label={translation("Broadcast.composer.linkButtonRemove")}
          title={translation("Broadcast.composer.linkButtonRemove")}
          onClick={() => onRemove(id)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </WhatsAppButton>
  );
}

/**
 * Botão de link por baixo do balão da mensagem. `linkButton` é
 * `{ id, buttonText }`; sem `id` o link veio do texto e não se tira daqui.
 */
export default function LinkButtonPreview({
  linkButton,
  onRemove = null,
  translation,
}) {
  if (!linkButton) return null;

  return (
    <div className={styles.linkButtonGroup} data-testid="link-button-preview">
      <LinkButton
        id={linkButton.id}
        buttonText={linkButton.buttonText}
        onRemove={onRemove}
        translation={translation}
      />

      <div className={styles.linkButtonHint}>
        {translation("Broadcast.composer.linkButtonHint")}
      </div>
    </div>
  );
}

/*
 * Balões à parte, um por cada link além do primeiro: o WhatsApp só deixa
 * um botão de link por mensagem. Seguem logo a seguir à mensagem.
 */
export function LinkBubblesPreview({
  bubbles = [],
  time = null,
  onRemove = null,
  translation,
}) {
  return bubbles.map((bubble) => (
    <div
      key={bubble.key || bubble.id}
      className={styles.linkButtonGroup}
      data-testid="link-bubble-preview"
    >
      <WhatsAppBubble time={time}>{bubble.text}</WhatsAppBubble>
      <LinkButton
        id={bubble.id}
        buttonText={bubble.buttonText}
        onRemove={onRemove}
        translation={translation}
      />
    </div>
  ));
}

/* Onde não há botões (Teams), os links seguem no fim do texto. */
export function LinksInTextNote({ labels = [], translation }) {
  if (!labels.length) return null;

  return (
    <div className={styles.linkButtonHint}>
      {translation("Broadcast.composer.linkButtonInText", {
        count: labels.length,
        labels: labels.join(", "),
      })}
    </div>
  );
}
