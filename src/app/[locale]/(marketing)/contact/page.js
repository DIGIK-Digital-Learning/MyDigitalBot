import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import SiteShell from "../components/Site/SiteShell";
import PageHero from "../components/Site/PageHero";
import ContactForm from "./ContactForm.jsx";
import styles from "./contactV2.module.css";
import { getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "LandingPage.Contact",
    path: "/contact",
  });
}

const STEPS = ["one", "two", "three"];

export default async function ContactPage() {
  const t = await getTranslations("LandingPage.Contact");
  const tp = await getTranslations("Pages.contact");

  return (
    <SiteShell>
      <PageHero
        title={t("title")}
        lead={t("subhead")}
        aside={
          <section className={styles.formCard} aria-label={t("title")}>
            <Suspense fallback={null}>
              <ContactForm />
            </Suspense>
          </section>
        }
      >
        <div className={styles.next}>
          <h2 className={styles.nextTitle}>{t("form.title")}</h2>
          <ol className={styles.steps}>
            {STEPS.map((key) => (
              <li key={key}>{t(`form.steps.${key}`)}</li>
            ))}
          </ol>
          <p className={styles.direct}>
            <Mail size={18} strokeWidth={2} aria-hidden="true" />
            <span>
              {tp("direct")} <a href={`mailto:${tp("email")}`}>{tp("email")}</a>
            </span>
          </p>
        </div>
      </PageHero>
    </SiteShell>
  );
}
