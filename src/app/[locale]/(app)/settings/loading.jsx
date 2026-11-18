"use client";

import { usePathname } from "@/i18n/navigation";

import SettingsSkeleton from "./components/SettingsSkeleton";

/*
 * Também aparece ao abrir Integrações ou Histórico vindo de outra secção,
 * por isso escolhe a página pelo caminho (#272).
 */
export default function Loading() {
  const pathname = usePathname();
  const section = pathname.startsWith("/settings/integrations")
    ? "integrations"
    : pathname.startsWith("/settings/activity")
      ? "activity"
      : "organization";

  return <SettingsSkeleton section={section} />;
}
