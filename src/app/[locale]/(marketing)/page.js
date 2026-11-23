import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Check,
  Euro,
  Languages,
  MessagesSquare,
  Smartphone,
  UsersRound,
} from "lucide-react";
import LoaderLink from "./components/TopLoader/LoaderLink";
import HomeJsonLd from "./components/HomeJsonLd/HomeJsonLd";
import BrandSymbol from "./components/HomeV2/BrandSymbol";
import ChatDemo from "./components/HomeV2/ChatDemo";
import UseCases from "./components/HomeV2/UseCases";
import SiteShell from "./components/Site/SiteShell";
import FinalCta from "./components/Site/FinalCta";
import site from "./components/Site/site.module.css";
import styles from "./components/HomeV2/homeV2.module.css";
import { formatCount, formatPrice, getPlan } from "./pricing/plans";
import { digikUrl, getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "LandingPage",
    path: "/",
    absoluteTitle: true,
  });
}

const PROOF = [
  { key: "channels", Icon: MessagesSquare },
  { key: "noApps", Icon: Smartphone },
  { key: "languages", Icon: Languages },
  { key: "setup", Icon: UsersRound },
];

const STEP_KEYS = ["setup", "learn", "measure"];
const COMPARE_ROWS = ["where", "time", "doubts", "data"];
const CASES = [
  { id: "microlearning", channel: "teams" },
  { id: "onboarding", channel: "whatsapp" },
  { id: "comms", channel: "teams" },
  { id: "assistant", channel: "whatsapp" },
];
const WHY = [
  { key: "team", Icon: UsersRound },
  { key: "channels", Icon: MessagesSquare },
  { key: "language", Icon: Languages },
  { key: "pricing", Icon: Euro },
];

export default async function LocaleIndex({ params }) {
  const { locale } = await params;
  const t = await getTranslations("HomeV2");

  const freePlan = getPlan("free");
  const entryPlan = getPlan("team");
  const freeUsers = formatCount(freePlan.users, locale);

  const chatLabels = t.raw("chatLabels");
  const cases = CASES.map(({ id, channel }) => ({
    id,
    channel,
    title: t(`cases.items.${id}.title`),
    text: t(`cases.items.${id}.text`),
    chat: t.raw(`cases.items.${id}.chat`),
  }));

  return (
    <SiteShell>
      <HomeJsonLd locale={locale} />

      <section className={styles.hero}>
        <div className={site.wrap}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>
                {t("hero.titleA")}{" "}
                <span className={styles.heroTitleAccent}>
                  {t("hero.titleB")}
                </span>
              </h1>
              <p className={styles.heroLead}>{t("hero.lead")}</p>
              <div className={styles.heroActions}>
                <LoaderLink
                  href="/contact"
                  className={site.primary}
                  data-page-demo-cta
                >
                  {t("hero.primary")}
                  <ArrowRight size={17} strokeWidth={2.3} aria-hidden="true" />
                </LoaderLink>
                <LoaderLink
                  href={{ pathname: "/contact", query: { plano: freePlan.id } }}
                  className={site.secondary}
                >
                  {t("hero.secondary")}
                </LoaderLink>
              </div>
              <p className={styles.heroNote}>
                <span>{t("hero.note", { users: freeUsers })}</span>
                <span>
                  {t("hero.maker")}{" "}
                  <a href={digikUrl(locale)} target="_blank" rel="noopener">
                    DIGIK
                  </a>
                </span>
              </p>
            </div>

            <div className={styles.heroVisual}>
              <BrandSymbol className={styles.heroSymbol} />
              <ChatDemo
                chat={t.raw("heroChat")}
                labels={chatLabels}
                variant="phone"
                channelSwitch
                initialCount={2}
              />
            </div>
          </div>

          <ul className={styles.proof}>
            {PROOF.map(({ key, Icon }) => (
              <li key={key}>
                <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
                {t(`proof.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={site.section} aria-labelledby="home-how">
        <div className={site.wrap}>
          <header className={`${site.sectionHead} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="home-how">
              {t("how.title")}
            </h2>
            <p className={site.sectionText}>{t("how.text")}</p>
          </header>

          <ol className={styles.steps}>
            {STEP_KEYS.map((key, index) => (
              <li className={`${styles.step} ${site.reveal}`} key={key}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className={styles.stepTitle}>
                  {t(`how.steps.${key}.title`)}
                </h3>
                <p className={styles.stepText}>{t(`how.steps.${key}.text`)}</p>
              </li>
            ))}
          </ol>

          <figure className={`${styles.panel} ${site.reveal}`}>
            <div className={styles.panelFrame}>
              <div className={styles.panelBar} aria-hidden="true">
                <i />
                <i />
                <i />
                <span>{t("how.panelCaption")}</span>
              </div>
              <Image
                className={styles.panelImage}
                src="/images/dashboard/metricas-home-hd.webp"
                alt={t("how.panelAlt")}
                width={2848}
                height={1854}
                quality={95}
                sizes="(max-width: 1280px) calc(100vw - 40px), 1200px"
              />
            </div>
          </figure>
        </div>
      </section>

      <section
        className={`${site.section} ${site.sectionWhite}`}
        aria-labelledby="home-cases"
      >
        <div className={site.wrap}>
          <header className={`${site.sectionHead} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="home-cases">
              {t("cases.title")}
            </h2>
            <p className={site.sectionText}>{t("cases.text")}</p>
          </header>
          <UseCases cases={cases} chatLabels={chatLabels} />
        </div>
      </section>

      <section
        className={`${site.section} ${site.sectionDark}`}
        aria-labelledby="home-compare"
      >
        <div className={site.wrap}>
          <header className={`${site.sectionHead} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="home-compare">
              {t("compare.title")}
            </h2>
            <p className={site.sectionText}>{t("compare.text")}</p>
          </header>

          <table className={`${styles.table} ${site.reveal}`}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={site.srOnly}>{t("compare.colLabel")}</span>
                </th>
                <th scope="col">{t("compare.colA")}</th>
                <th scope="col">{t("compare.colB")}</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row}>
                  <th scope="row">{t(`compare.rows.${row}.label`)}</th>
                  <td>{t(`compare.rows.${row}.a`)}</td>
                  <td>
                    <span>
                      <Check size={16} strokeWidth={2.6} aria-hidden="true" />
                      {t(`compare.rows.${row}.b`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="home-why">
        <div className={`${site.wrap} ${styles.whyGrid}`}>
          <h2
            className={`${site.sectionTitle} ${styles.whyHeading}`}
            id="home-why"
          >
            {t("why.title")}
          </h2>
          <ul className={styles.whyList}>
            {WHY.map(({ key, Icon }) => (
              <li className={`${styles.whyItem} ${site.reveal}`} key={key}>
                <span className={styles.whyIcon} aria-hidden="true">
                  <Icon size={21} strokeWidth={1.9} />
                </span>
                <h3 className={styles.whyTitle}>
                  {t(`why.items.${key}.title`)}
                </h3>
                <p className={styles.whyText}>
                  {t(`why.items.${key}.text`, { users: freeUsers })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.pricing} aria-labelledby="home-pricing">
        <div className={site.wrap}>
          <div className={`${styles.priceBand} ${site.reveal}`}>
            <div>
              <h2 className={styles.priceTitle} id="home-pricing">
                {t("pricing.title")}
              </h2>
              <p className={styles.priceText}>
                {t("pricing.text", {
                  freeUsers,
                  price: formatPrice(entryPlan.price, locale),
                  users: formatCount(entryPlan.users, locale),
                })}
              </p>
            </div>
            <LoaderLink href="/pricing" className={site.ghost}>
              {t("pricing.cta")}
              <ArrowRight size={17} strokeWidth={2.3} aria-hidden="true" />
            </LoaderLink>
          </div>
        </div>
      </section>

      <FinalCta />
    </SiteShell>
  );
}
