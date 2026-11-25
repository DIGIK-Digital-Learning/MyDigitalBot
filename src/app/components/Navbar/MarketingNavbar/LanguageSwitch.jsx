"use client";

import { Suspense, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { localeOptions } from "@/i18n/localeMeta";
import styles from "./languageMenu.module.css";

// Seletor de idioma para o menu do telemóvel: todas as línguas à vista
// (PT | EN), sem dropdown. No desktop continua o LanguageMenu.
const EMPTY_QUERY = {};

// O useSearchParams precisa de um <Suspense> para a página poder ser
// estática. O fallback (que vai no HTML gerado no build) mostra os mesmos
// links, só sem os parâmetros do URL; o browser junta-os logo a seguir.
export default function LanguageSwitch(props) {
  return (
    <Suspense fallback={<LanguageSwitchLinks {...props} query={EMPTY_QUERY} />}>
      <LanguageSwitchWithQuery {...props} />
    </Suspense>
  );
}

function LanguageSwitchWithQuery(props) {
  const searchParams = useSearchParams();
  // Mantém os parâmetros do URL ao mudar de língua.
  const query = useMemo(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams],
  );
  return <LanguageSwitchLinks {...props} query={query} />;
}

function LanguageSwitchLinks({ className = "", onSwitch, query }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Lang");

  return (
    <nav className={`${styles.switch} ${className}`} aria-label={t("ariaLabel")}>
      <Globe size={17} aria-hidden="true" className={styles.switchIcon} />
      {localeOptions.map((option) => {
        const isActive = option.code === locale;
        return (
          <Link
            key={option.code}
            href={{ pathname, query }}
            locale={option.code}
            prefetch={false}
            aria-current={isActive ? "true" : undefined}
            aria-label={t("switchTo", { code: option.label })}
            className={`${styles.switchItem} ${isActive ? styles.switchItemActive : ""}`}
            onClick={onSwitch}
          >
            {option.short}
          </Link>
        );
      })}
    </nav>
  );
}
