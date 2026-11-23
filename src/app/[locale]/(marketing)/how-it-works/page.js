import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { PlugZap } from "lucide-react";
import SiteShell from "../components/Site/SiteShell";
import PageHero from "../components/Site/PageHero";
import FinalCta from "../components/Site/FinalCta";
import site from "../components/Site/site.module.css";
import styles from "./howItWorksV2.module.css";
import { getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "HowItWorksPage",
    path: "/how-it-works",
  });
}

// As cinco fases (textos em HowItWorksPage.steps), por ordem. Cada uma tem a
// sua imagem de vidro em /public/images/how-it-works (geradas no ChatGPT).
// As cenas em código (GlassScene.jsx) ficam guardadas como alternativa.
const STEPS = [
  { key: "initialSetup", image: "fase-1-configuracao" },
  { key: "communicationStructure", image: "fase-2-estrutura" },
  { key: "aiAssistants", image: "fase-3-assistentes" },
  { key: "testingLaunch", image: "fase-4-lancamento" },
  { key: "optimization", image: "fase-5-otimizacao" },
];

export default async function HowItWorksPage() {
  const t = await getTranslations("HowItWorksPage");
  const tp = await getTranslations("Pages.how");
  const tFinal = await getTranslations("HomeV2.final");

  return (
    <SiteShell>
      <PageHero
        title={t("hero.title")}
        lead={t("hero.subhead")}
        actions={[
          { href: "/contact", label: t("hero.primaryCta") },
          { href: "/pricing", label: tFinal("pricing") },
        ]}
      />

      <section className={site.section} aria-labelledby="how-steps">
        <div className={site.wrap}>
          <header className={`${styles.intro} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="how-steps">
              {tp("stepsTitle")}
            </h2>
            <p className={`${site.sectionText} ${styles.introText}`}>
              {tp("stepsText")}
            </p>
          </header>

          <ol className={styles.steps}>
            {STEPS.map(({ key, image }, index) => (
              <li className={`${styles.step} ${site.reveal}`} key={key}>
                <div className={styles.stepVisual}>
                  <Image
                    className={styles.stepImage}
                    src={`/images/how-it-works/${image}.webp`}
                    alt=""
                    width={1536}
                    height={1024}
                    quality={95}
                    sizes="(max-width: 860px) calc(100vw - 40px), 560px"
                  />
                </div>
                <div className={styles.stepBody}>
                  <span className={styles.stepNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className={styles.stepTitle}>
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className={styles.stepText}>
                    {t(`steps.${key}.description`)}
                  </p>
                  {/* As 5 fases já são a lista; dentro de cada uma, em vez de
                      4 pills, só o que fica pronto no fim. */}
                  <p className={styles.stepOutcome}>
                    <span className={styles.stepOutcomeLabel}>
                      {tp("outcomeLabel")}
                    </span>
                    {t(`steps.${key}.outcome`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.bandSection} aria-labelledby="how-simple">
        <div className={site.wrap}>
          <div className={`${styles.band} ${site.reveal}`}>
            <span className={styles.bandIcon} aria-hidden="true">
              <PlugZap size={26} strokeWidth={1.8} />
            </span>
            <div>
              <h2 className={styles.bandTitle} id="how-simple">
                {t("cta.title")}
              </h2>
              <p className={styles.bandText}>{t("cta.text")}</p>
            </div>
          </div>
        </div>
      </section>

      <FinalCta secondaryHref="/product" secondaryLabelKey="product" />
    </SiteShell>
  );
}
