import { routing } from "@/i18n/routing";
import {
  LEGAL_DOCS,
  MARKETING_PATHS,
  absoluteUrl,
  languageAlternates,
  legalPath,
} from "@/lib/seo/metadata";

// Só páginas públicas de marketing e documentos legais, nas duas línguas.
// Fica de fora tudo o que é app, login e /r/[token].
export default function sitemap() {
  const paths = [
    ...MARKETING_PATHS,
    ...Object.keys(LEGAL_DOCS).map(legalPath),
  ];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: languageAlternates(path) },
      changeFrequency: path.startsWith("/legal") ? "yearly" : "monthly",
      priority: path === "/" ? 1 : path.startsWith("/legal") ? 0.3 : 0.8,
    })),
  );
}
