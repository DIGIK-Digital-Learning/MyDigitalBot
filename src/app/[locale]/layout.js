import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { ConfirmProvider } from "../components/Confirm/ConfirmProvider";
import NavCursor from "../components/NavCursor/NavCursor";
import TopLoader from "./(marketing)/components/TopLoader/TopLoader";
import { AlertProvider } from "../components/Alert/AlertProvider";
import { AuthProvider } from "../AuthContext";
import { GlobalLoaderProvider } from "../LoadingScreen/GlobalLoaderContext";
import { inter } from "../fonts/inter";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  // Caminhos como /llms.txt caíam aqui como se fossem uma língua e
  // devolviam a homepage com 200. Língua desconhecida = 404.
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Língua vinda do URL e não dos headers: assim as páginas de marketing
  // podem ser geradas no build (estáticas) em vez de a cada pedido.
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    // suppressHydrationWarning só no <html>: extensões do browser (ex.:
    // LanguageTool, data-lt-installed) mexem nos atributos antes do React.
    // Não esconde erros dos componentes dentro da página.
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body>
        {/* Filtro do vidro "Refraction" (--glass-filter em globals.css):
            ruído suave que desloca o fundo atrás dos botões e pills. */}
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
          style={{ position: "absolute" }}
        >
          <filter id="glass-refraction" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.006 0.01"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="soft"
              scale="48"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>

          {/* Ícones com traço em vidro (ex.: .proofIcon na home).
              Gradiente no espaço 24x24 dos ícones lucide (userSpaceOnUse:
              com objectBoundingBox as linhas retas ficavam invisíveis). */}
          <linearGradient
            id="glass-icon-stroke"
            gradientUnits="userSpaceOnUse"
            x1="4"
            y1="2"
            x2="20"
            y2="22"
          >
            <stop offset="0" stopColor="#eaf7ff" />
            <stop offset="0.45" stopColor="#4ab0ff" />
            <stop offset="1" stopColor="#34d7b6" />
          </linearGradient>
          {/* Glow leve por baixo do traço (versão "B · Gradiente suave"
              escolhida no /glass-lab). */}
          <filter
            id="glass-icon"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feComponentTransfer in="blur" result="glow">
              <feFuncA type="linear" slope="0.45" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </svg>
        <GlobalLoaderProvider>
          <AuthProvider>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <TopLoader />
              <NavCursor />
              <AlertProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </AlertProvider>
            </NextIntlClientProvider>
          </AuthProvider>
        </GlobalLoaderProvider>
      </body>
    </html>
  );
}
