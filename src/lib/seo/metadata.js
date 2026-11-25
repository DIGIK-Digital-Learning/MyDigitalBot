import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

// Domínio público do site de marketing. NEXT_PUBLIC_SITE_URL permite outro
// domínio (ex.: staging); sem ela, canonical e sitemap apontam para produção.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://mydigitalbot.com"
).replace(/\/+$/, "");

export const SITE_NAME = "MyDigitalBot";

// A DIGIK é a empresa por trás do produto. O site EN da DIGIK é o digiklearning.com.
export const DIGIK_URLS = {
  pt: "https://www.digik.pt/pt",
  en: "https://www.digiklearning.com/en",
};

export function digikUrl(locale) {
  return DIGIK_URLS[locale] ?? DIGIK_URLS.pt;
}
export const SITE_LOGO_PATH = "/images/Logos/Logo.png";

const OG_LOCALES = { pt: "pt_PT", en: "en_GB" };

// public/og.png (1732x909). Absoluto via metadataBase do layout raiz.
const OG_IMAGE = { url: "/og.png", width: 1732, height: 909, alt: "MyDigitalBot" };

// Páginas públicas de marketing, pelo caminho interno (o PT traduzido está em routing.pathnames).
export const MARKETING_PATHS = [
  "/",
  "/product",
  "/solution",
  "/how-it-works",
  "/pricing",
  "/contact",
];

// Áreas privadas da app (pastas em src/app/[locale]/(app)), fora do robots.txt.
// Inclui também as de outros branches, para o robots.txt não mudar no merge.
export const PRIVATE_ROOTS = [
  "admin",
  "analytics",
  "assistants",
  "automations",
  "broadcast",
  "dashboard",
  "options",
  "platform-admin",
  "private",
  "settings",
  "teams-groups",
  "templates",
  "users",
];

// Documentos legais: /legal?doc=<slug>. O namespace é o de "Public" em messages.
export const LEGAL_DOCS = {
  "terms-of-service": "TermsOfService",
  "data-processing-agreement": "Dpa",
  "privacy-policy": "PrivacyPolicy",
  "security-providers": "SecurityProviders",
};
export const DEFAULT_LEGAL_DOC = "terms-of-service";

export function legalPath(slug) {
  return `/legal?doc=${slug}`;
}

// localePrefix "as-needed": o pt (default) não leva prefixo, o en leva /en.
// Os caminhos traduzidos (ex.: /how-it-works → /como-funciona em PT) vêm de
// routing.pathnames; o que não está lá fica igual.
export function localizedPath(locale, path = "/") {
  const [base, query] = path.split("?");
  const config = routing.pathnames?.[base];
  const translated = !config
    ? base
    : typeof config === "string"
      ? config
      : (config[locale] ?? base);
  const full = query ? `${translated}?${query}` : translated;
  const rest = full === "/" ? "" : full;
  if (locale === routing.defaultLocale) return rest || "/";
  return `/${locale}${rest}`;
}

export function absoluteUrl(locale, path = "/") {
  return `${SITE_URL}${localizedPath(locale, path)}`;
}

export function languageAlternates(path = "/") {
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, absoluteUrl(locale, path)]),
  );
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

export function buildPageMetadata({
  locale,
  path = "/",
  title,
  description,
  absoluteTitle = false,
}) {
  const url = absoluteUrl(locale, path);
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      title: fullTitle,
      description,
      locale: OG_LOCALES[locale] ?? OG_LOCALES[routing.defaultLocale],
      alternateLocale: routing.locales
        .filter((l) => l !== locale)
        .map((l) => OG_LOCALES[l]),
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

function resolveLocale(locale) {
  return routing.locales.includes(locale) ? locale : routing.defaultLocale;
}

// Metadados de uma página de marketing a partir de <namespace>.metadata.{title,description}.
export async function getPageMetadata({
  params,
  namespace,
  path,
  absoluteTitle = false,
}) {
  const locale = resolveLocale((await params)?.locale);
  // O generateMetadata pode correr antes do layout: sem isto o next-intl lê a
  // língua dos headers e a página deixa de poder ser estática.
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace });

  return buildPageMetadata({
    locale,
    path,
    title: t("metadata.title"),
    description: t("metadata.description"),
    absoluteTitle,
  });
}
