"use client";

import { useState } from "react";
import { Info } from "lucide-react";

import styles from "../broadcast.module.css";

const TOOLTIP_WIDTH = 260;

/**
 * Ícone «i» com uma explicação, como na aba Media: aparece ao passar o rato,
 * ao focar com o teclado ou ao tocar (telemóvel). A explicação fica fixa no
 * ecrã, por baixo do ícone e dentro da largura da janela, para não ser cortada
 * pelo painel nem sair do ecrã num telemóvel.
 */
export default function InfoHint({ text }) {
  const [pos, setPos] = useState(null);

  function show(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const centered = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - 8;

    setPos({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(centered, maxLeft)),
    });
  }

  return (
    <button
      type="button"
      className={styles.infoHint}
      aria-label={text}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
      onClick={(event) => (pos ? setPos(null) : show(event))}
    >
      <Info size={15} aria-hidden />
      {pos ? (
        <span
          className={styles.infoTooltip}
          style={{ top: pos.top, left: pos.left, width: TOOLTIP_WIDTH }}
          role="tooltip"
        >
          {text}
        </span>
      ) : null}
    </button>
  );
}
