import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/seo/metadata";

// Base fixa: canonical, og:image e sitemap apontam sempre para o domínio
// público (e não para www, previews ou localhost). Títulos e descrições
// vêm do generateMetadata de cada página.
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Microlearning no Microsoft Teams e no WhatsApp`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  icons: {
    icon: "/favicon.ico",
  },
};

// O <html> e o <body> estão em [locale]/layout.js, que recebe a língua pelos
// params. Ler a língua aqui (getLocale) obrigava a ler os headers do pedido e
// tornava todas as páginas dinâmicas (sem cache na CDN). O not-found.jsx
// daqui tem o seu próprio <html>, porque fica fora do [locale].
export default function RootLayout({ children }) {
  return children;
}
