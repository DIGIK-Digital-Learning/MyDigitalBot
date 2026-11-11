"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

/*
 * #243: mudar de língua (PT/EN) troca a página sem a recarregar, e o
 * `<html lang>` do layout de topo ficava com a língua antiga. Isto mantém-no
 * igual à língua que se está a ver (leitores de ecrã, tradutor do Chrome).
 */
export default function HtmlLang() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
