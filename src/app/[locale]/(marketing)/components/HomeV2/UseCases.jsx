"use client";

import { useId, useRef, useState } from "react";
import ChatDemo from "./ChatDemo";
import styles from "./homeV2.module.css";

/**
 * Casos de uso em separadores: à esquerda a lista (o ativo abre os pontos
 * principais), à direita a conversa de exemplo desse caso.
 * Teclado: setas para mudar de separador.
 */
export default function UseCases({ cases, chatLabels }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef([]);
  const current = cases[active];

  const focusTab = (index) => {
    const next = (index + cases.length) % cases.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event, index) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(index - 1);
    }
  };

  return (
    <div className={styles.cases}>
      <div
        className={styles.caseTabs}
        role="tablist"
        aria-orientation="vertical"
      >
        {cases.map((item, index) => {
          const selected = index === active;
          return (
            <div
              key={item.id}
              className={`${styles.caseItem} ${selected ? styles.caseItemActive : ""}`}
            >
              <button
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                className={styles.caseTab}
                onClick={() => setActive(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                <span className={styles.caseTabTitle}>{item.title}</span>
                <span className={styles.caseTabText}>{item.text}</span>
              </button>
            </div>
          );
        })}
      </div>

      <div
        className={styles.casePanel}
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
      >
        <ChatDemo
          key={current.id}
          chat={current.chat}
          labels={chatLabels}
          variant="card"
          initialChannel={current.channel}
          initialCount={1}
        />
      </div>
    </div>
  );
}
