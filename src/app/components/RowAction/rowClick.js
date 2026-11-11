/*
 * #238: clicar numa linha faz o mesmo que o "Ver" dessa linha. Mas um clique
 * que já tem dono não abre nada: botões, links, caixas de seleção e menus
 * (incluindo opções de um menu aberto num portal, que no React também
 * "sobem" até à linha), e o fim de uma seleção de texto.
 */
const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="button"], [role="option"], [role="listbox"], [role="menu"], [role="menuitem"], [contenteditable="true"]';

export function isRowClick(event) {
  const row = event.currentTarget;
  const target = event.target;

  /* Veio de um portal (por exemplo, a lista de um PillSelect). */
  if (!(target instanceof Node) || !row.contains(target)) return false;

  const interactive = target.closest?.(INTERACTIVE);
  if (interactive && interactive !== row && row.contains(interactive)) {
    return false;
  }

  const selection =
    typeof window !== "undefined" ? window.getSelection?.() : null;
  if (selection && String(selection).length > 0) return false;

  return true;
}

/* `onClick` de uma linha que só reage a cliques na própria linha. */
export function rowClickHandler(open) {
  return (event) => {
    if (isRowClick(event)) open(event);
  };
}
