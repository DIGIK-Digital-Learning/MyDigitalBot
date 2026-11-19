"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import PublicDocument from "./PublicDocument";
import { buildDPA, buildPrivacy, buildTOS, buildSec } from "./documents";
import styles from "../public.module.css";

const DEFAULT_DOC = "terms-of-service";

export default function LegalDocumentClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tDpa = useTranslations("Public.Dpa");
  const tTos = useTranslations("Public.TermsOfService");
  const tP = useTranslations("Public.PrivacyPolicy");
  const tSp = useTranslations("Public.SecurityProviders");

  const docs = useMemo(
    () => ({
      "terms-of-service": {
        title: tTos("Title"),
        subtitle: tTos("LastUpdated"),
        lastUpdated: "24/03/2026",
        sections: buildTOS(tTos).sections,
      },
      "data-processing-agreement": {
        title: tDpa("Title"),
        subtitle: tDpa("LastUpdated"),
        lastUpdated: "18/11/2026",
        sections: buildDPA(tDpa).sections,
      },
      "privacy-policy": {
        title: tP("Title"),
        subtitle: tP("LastUpdated"),
        lastUpdated: "18/11/2026",
        sections: buildPrivacy(tP).sections,
      },
      "security-providers": {
        title: tSp("Title"),
        subtitle: tSp("LastUpdated"),
        lastUpdated: "18/11/2026",
        sections: buildSec(tSp).sections,
      },
    }),
    [tDpa, tTos, tP, tSp],
  );

  const rawDoc = searchParams.get("doc");
  const activeSlug = rawDoc && docs[rawDoc] ? rawDoc : DEFAULT_DOC;
  const activeDoc = docs[activeSlug];

  useEffect(() => {
    if (!rawDoc) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("doc", DEFAULT_DOC);

      router.replace(
        {
          pathname,
          query: Object.fromEntries(params.entries()),
        },
        { scroll: false },
      );
    }
  }, [rawDoc, searchParams, router, pathname]);

  function handleSelect(slug) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("doc", slug);
    router.replace(
      {
        pathname,
        query: Object.fromEntries(params.entries()),
      },
      { scroll: false },
    );
  }

  return (
    <div className={styles.legalShell}>
      <div className={styles.buttonContainer}>
        <div className={styles.docTabs}>
          <button
            type="button"
            onClick={() => handleSelect("terms-of-service")}
            className={`${styles.docTab} ${
              activeSlug === "terms-of-service" ? styles.docTabActive : ""
            }`}
          >
            {docs["terms-of-service"].title}
          </button>
          <button
            type="button"
            onClick={() => handleSelect("data-processing-agreement")}
            className={`${styles.docTab} ${
              activeSlug === "data-processing-agreement"
                ? styles.docTabActive
                : ""
            }`}
          >
            {docs["data-processing-agreement"].title}
          </button>
          <button
            type="button"
            onClick={() => handleSelect("privacy-policy")}
            className={`${styles.docTab} ${
              activeSlug === "privacy-policy" ? styles.docTabActive : ""
            }`}
          >
            {docs["privacy-policy"].title}
          </button>
          <button
            type="button"
            onClick={() => handleSelect("security-providers")}
            className={`${styles.docTab} ${
              activeSlug === "security-providers" ? styles.docTabActive : ""
            }`}
          >
            {docs["security-providers"].title}
          </button>
        </div>
      </div>
      <PublicDocument
        title={activeDoc.title}
        subtitle={activeDoc.subtitle}
        lastUpdated={activeDoc.lastUpdated}
        sections={activeDoc.sections}
      />
    </div>
  );
}
