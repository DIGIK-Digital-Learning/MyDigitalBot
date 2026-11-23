import localFont from "next/font/local";
import "./globals.css";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SITE_NAME, SITE_URL } from "@/lib/seo/metadata";
import { AuthProvider } from "./AuthContext";
import { GlobalLoaderProvider } from "./LoadingScreen/GlobalLoaderContext";

const inter = localFont({
  src: [
    {
      path: "./fonts/InterVariable.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

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

export default async function RootLayout({ children }) {
  // Língua do pedido (definida pelo middleware do next-intl), não do cookie:
  // o /en tem de sair com lang="en" mesmo na primeira visita.
  const requested = await getLocale();
  const locale = routing.locales.includes(requested)
    ? requested
    : routing.defaultLocale;

  return (
    // suppressHydrationWarning só no <html>: extensões do browser (ex.:
    // LanguageTool, data-lt-installed) mexem nos atributos antes do React.
    // Não esconde erros dos componentes dentro da página.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body>
        <GlobalLoaderProvider>
          <AuthProvider>{children}</AuthProvider>
        </GlobalLoaderProvider>
      </body>
    </html>
  );
}
