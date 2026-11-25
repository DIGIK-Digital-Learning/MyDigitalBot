import { redirect } from "@/i18n/navigation";
import SettingsView from "./SettingsView";
import { hrefFromLegacyTab } from "./helpers/settingsSections";

/* Definições → Organização. Os links antigos com ?tab=… seguem para a página nova. */
export default async function SettingsOrganizationPage({
  params,
  searchParams,
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  const legacyHref = hrefFromLegacyTab(tab);

  if (legacyHref) redirect({ href: legacyHref, locale });

  return <SettingsView section="organization" />;
}
