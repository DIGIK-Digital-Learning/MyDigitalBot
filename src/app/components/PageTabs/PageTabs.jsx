"use client";

import styles from "./PageTabs.module.css";

/**
 * Separadores no topo de uma página (#239), com o aspeto dos das Automações
 * (Regras · Fila · Entregas). Quem usa guarda o separador ativo (por exemplo
 * no endereço) e recebe a escolha em `onChange`.
 *
 * - `tabs`: [{ id, label }]
 * - `idPrefix`: liga cada separador ao seu painel (`${idPrefix}-panel-${id}`).
 */
export default function PageTabs({ tabs, active, onChange, label, idPrefix }) {
  function onKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = null;

    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;

    event.preventDefault();
    onChange(tabs[next].id);
    event.currentTarget
      .querySelectorAll('[role="tab"]')
      [next]?.focus();
  }

  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tab} ${selected ? styles.active : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* O painel de um separador. */
export function TabPanel({ id, idPrefix, children, className = "" }) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      className={className}
    >
      {children}
    </div>
  );
}
