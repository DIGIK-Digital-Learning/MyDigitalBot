// src/i18n/routing.js
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "pt"],
  defaultLocale: "pt",
  // 'as-needed' = only prefix non-default locale
  // 'always'    = always prefix every locale
  localePrefix: "as-needed",

  // Public marketing pages get Portuguese URLs in PT. Code keeps using the
  // internal (English) paths in <Link href> and usePathname(); next-intl
  // translates them. Old PT URLs (e.g. /how-it-works) redirect to the PT ones.
  // Paths not listed here (app, login, legal, /r/...) stay the same.
  pathnames: {
    "/": "/",
    "/solution": { pt: "/solucao", en: "/solution" },
    "/product": { pt: "/produto", en: "/product" },
    "/how-it-works": { pt: "/como-funciona", en: "/how-it-works" },
    "/pricing": { pt: "/precos", en: "/pricing" },
    "/contact": { pt: "/contacto", en: "/contact" },
  },
});
