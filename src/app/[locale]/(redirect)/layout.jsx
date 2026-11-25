import LanguageSwitch from "@/app/components/TopBar/LanguageSwitch";

// App, login, legal e links rastreados continuam a ser gerados a cada pedido,
// como antes. Só as páginas de marketing passaram a estáticas.
export const dynamic = "force-dynamic";

export default function RedirectLayout({ children }) {
  return <LanguageSwitch>{children}</LanguageSwitch>;
}
