/*
 * #239: a página divide-se em separadores, e o separador aberto fica no
 * endereço (?tab=…) para se poder partilhar o link e usar o "voltar".
 * Sem ?tab, abre a Organização.
 */
export const SETTINGS_TABS = ["organizacao", "integracoes", "historico"];
export const DEFAULT_TAB = SETTINGS_TABS[0];

export function tabFromParam(value) {
  return SETTINGS_TABS.includes(value) ? value : DEFAULT_TAB;
}
