import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import {
  DEFAULT_LEGAL_DOC,
  LEGAL_DOCS,
  buildPageMetadata,
  legalPath,
} from "@/lib/seo/metadata";
import LegalDocumentClient from "../components/LegalDocumentClient";

export async function generateMetadata({ params, searchParams }) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale)
    ? rawLocale
    : routing.defaultLocale;
  const { doc } = (await searchParams) ?? {};
  const slug =
    typeof doc === "string" && LEGAL_DOCS[doc] ? doc : DEFAULT_LEGAL_DOC;

  const t = await getTranslations({ locale, namespace: "Public" });

  return buildPageMetadata({
    locale,
    path: legalPath(slug),
    title: t(`${LEGAL_DOCS[slug]}.Title`),
    description: t(`metadata.descriptions.${slug}`),
  });
}

export default function LegalPage() {
  return (
    <Suspense fallback={null}>
      <LegalDocumentClient />
    </Suspense>
  );
}
