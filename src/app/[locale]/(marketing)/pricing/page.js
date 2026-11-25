import { getTranslations, setRequestLocale } from "next-intl/server";
import SiteShell from "../components/Site/SiteShell";
import PageHero from "../components/Site/PageHero";
import FinalCta from "../components/Site/FinalCta";
import PricingExplorer from "./PricingExplorer.jsx";
import { getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "PricingPage",
    path: "/pricing",
  });
}

export default async function PricingPage({ params }) {
  // Língua pelo URL: deixa a página ser gerada no build (estática).
  setRequestLocale((await params).locale);
  const t = await getTranslations("PricingPage");

  return (
    <SiteShell>
      <PageHero title={t("hero.title")} lead={t("hero.subhead")} />
      <PricingExplorer />
      <FinalCta />
    </SiteShell>
  );
}
