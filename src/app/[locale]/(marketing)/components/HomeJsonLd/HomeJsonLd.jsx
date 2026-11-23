import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import {
  SITE_LOGO_PATH,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/seo/metadata";

const PUBLISHER_ID = "https://www.digik.pt/#organization";

// Dados estruturados da homepage. Sem preços nem avaliações: ainda não estão definidos.
export default async function HomeJsonLd({ locale }) {
  const lang = routing.locales.includes(locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: lang, namespace: "LandingPage" });

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": PUBLISHER_ID,
        name: "DIGIK - Digital Learning",
        url: "https://www.digik.pt",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: absoluteUrl(lang, "/"),
        image: `${SITE_URL}${SITE_LOGO_PATH}`,
        description: t("metadata.description"),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: lang,
        publisher: { "@id": PUBLISHER_ID },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // "<" escapado para o JSON não conseguir fechar a tag <script>
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
