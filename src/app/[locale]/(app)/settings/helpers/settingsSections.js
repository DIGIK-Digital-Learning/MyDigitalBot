/*
 * As Definições dividem-se em quatro páginas, com submenu na barra lateral
 * (como as Mensagens): Organização, Equipa (#247), Integrações e Histórico
 * de atividade.
 * Antes eram separadores na mesma página (#239), com o separador em ?tab=…;
 * esses links antigos continuam a funcionar e levam à página certa.
 */
export const SETTINGS_SECTIONS = [
  { id: "organization", href: "/settings" },
  { id: "team", href: "/settings/team" },
  { id: "integrations", href: "/settings/integrations" },
  { id: "activity", href: "/settings/activity" },
];

const LEGACY_TABS = {
  integracoes: "/settings/integrations",
  historico: "/settings/activity",
};

/* Para onde leva um link antigo /settings?tab=…; null fica na Organização. */
export function hrefFromLegacyTab(tab) {
  return LEGACY_TABS[tab] ?? null;
}
