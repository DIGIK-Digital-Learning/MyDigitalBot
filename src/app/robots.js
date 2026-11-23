import { routing } from "@/i18n/routing";
import { PRIVATE_ROOTS, SITE_URL } from "@/lib/seo/metadata";

function withLocalePrefixes(path) {
  return [path, ...routing.locales.map((locale) => `/${locale}${path}`)];
}

export default function robots() {
  // Deploys de preview/staging na Vercel não devem ser indexados.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  const disallow = [
    "/api/",
    // /r/[token] = links rastreados (redirect), não são páginas
    ...withLocalePrefixes("/r/"),
    ...PRIVATE_ROOTS.flatMap((root) => withLocalePrefixes(`/${root}`)),
  ];

  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
