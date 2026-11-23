import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import SiteShell from "../components/Site/SiteShell";
import PageHero from "../components/Site/PageHero";
import FinalCta from "../components/Site/FinalCta";
import site from "../components/Site/site.module.css";
import styles from "./productV2.module.css";
import { getPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  return getPageMetadata({
    params,
    namespace: "ProductPage",
    path: "/product",
  });
}

// Textos em ProductPage.cards. As imagens aparecem inteiras (sem corte), na
// proporção original. "dashboard/" = prints reais do painel (dados fictícios,
// 10-11-2026); "product/" = fotos geradas no ChatGPT com os prints reais
// encaixados nos ecrãs (12-11-2026).
// Ordem: 1.ª linha os dois cards com lista e print do painel, 2.ª linha os
// dois só com frase e foto. Assim cada linha tem textos e imagens da mesma
// altura e não sobra espaço em branco.
const FEATURES = [
  { key: "messages", image: "/images/dashboard/enviar-conteudo.webp", w: 2360, h: 1656 },
  { key: "assistants", image: "/images/dashboard/assistentes-conteudo.webp", w: 2360, h: 1656 },
  { key: "channels", image: "/images/product/canais-trabalho-hd.webp", w: 2400, h: 1600 },
  { key: "knowledge", image: "/images/product/conhecimento-seguradora-hd.webp", w: 2400, h: 1600 },
];

// Posição de cada nota em cima de metricas-completo-hd.webp (em % do print;
// --x é a ponta esquerda da nota), nos espaços vazios do painel para não
// tapar números: linha do título Resumo geral, linha do título Atividade,
// fim da linha Automações e fim da linha Links.
const DASHBOARD_NOTES = [
  { "--x": "33%", "--y": "15.6%" },
  { "--x": "30%", "--y": "41%" },
  { "--x": "68%", "--y": "71%" },
  { "--x": "53%", "--y": "92%" },
];

const TRUST_LINKS = [
  { key: "dpa", doc: "data-processing-agreement" },
  { key: "privacy", doc: "privacy-policy" },
  { key: "security", doc: "security-providers" },
];

export default async function ProductPage() {
  const t = await getTranslations("ProductPage");
  const tp = await getTranslations("Pages.product");
  const tFinal = await getTranslations("HomeV2.final");

  return (
    <SiteShell>
      <PageHero
        title={tp("title")}
        lead={t("hero.subhead")}
        actions={[
          { href: "/contact", label: t("hero.primaryCta") },
          { href: "/how-it-works", label: tFinal("secondary") },
        ]}
        aside={
          <div className={styles.heroShot}>
            <Image
              src="/images/product/hero-rh-trabalho-hd.webp"
              alt={tp("heroAlt")}
              width={2400}
              height={1600}
              quality={95}
              priority
              sizes="(max-width: 960px) calc(100vw - 40px), 600px"
            />
          </div>
        }
      />

      <section className={site.section} aria-labelledby="product-features">
        <div className={site.wrap}>
          <header className={`${site.sectionHead} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="product-features">
              {tp("featuresTitle")}
            </h2>
            <p className={site.sectionText}>{tp("featuresText")}</p>
          </header>

          <div className={styles.bento}>
            {FEATURES.map(({ key, image, w, h }) => (
              <article
                key={key}
                className={`${styles.feature} ${site.reveal}`}
                aria-labelledby={`feature-${key}`}
              >
                <div className={styles.featureCopy}>
                  <h3 className={styles.featureTitle} id={`feature-${key}`}>
                    {t(`cards.${key}.title`)}
                  </h3>
                  <p className={styles.featureText}>
                    {t(`cards.${key}.description`)}
                  </p>
                  {/* Só Mensagens e Assistentes têm lista (detalhe que a
                      frase não diz); em Canais e Conhecimento a lista
                      repetia o título, por isso saiu do JSON. */}
                  {t.has(`cards.${key}.checks`) ? (
                    <ul className={site.checks}>
                      {Object.values(t.raw(`cards.${key}.checks`)).map(
                        (check) => (
                          <li key={check}>
                            <Check
                              size={16}
                              strokeWidth={2.6}
                              aria-hidden="true"
                            />
                            {check}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
                <div className={styles.featureImage}>
                  <Image
                    src={image}
                    alt={tp(`alts.${key}`)}
                    width={w}
                    height={h}
                    quality={95}
                    sizes="(max-width: 720px) calc(100vw - 40px), 600px"
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className={`${site.section} ${site.sectionDark}`}
        aria-labelledby="product-dashboard"
      >
        <div className={`${site.wrap} ${styles.dashboard}`}>
          <div className={`${styles.dashboardCopy} ${site.reveal}`}>
            <h2 className={site.sectionTitle} id="product-dashboard">
              {tp("dashboard.title")}
            </h2>
            <p className={`${site.sectionText} ${styles.dashboardText}`}>
              {tp("dashboard.text")}
            </p>
          </div>
          <figure className={`${styles.dashboardFigure} ${site.reveal}`}>
            <div className={styles.dashboardShot}>
              <Image
                src="/images/dashboard/metricas-completo-hd.webp"
                alt={tp("dashboard.alt")}
                width={2848}
                height={2294}
                quality={95}
                sizes="(max-width: 960px) calc(100vw - 40px), 720px"
              />
            </div>
            {/* Notas em cima do print, cada uma junto da zona a que se refere
                (no telemóvel passam para baixo do print). */}
            <figcaption className={styles.dashboardNotes}>
              {tp.raw("dashboard.notes").map((note, index) => (
                <span
                  key={note}
                  className={styles.dashboardNote}
                  style={DASHBOARD_NOTES[index]}
                >
                  {note}
                </span>
              ))}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.trust} aria-labelledby="product-trust">
        <div className={site.wrap}>
          <div className={`${styles.trustBand} ${site.reveal}`}>
            <div>
              <h2 className={styles.trustTitle} id="product-trust">
                {tp("trust.title")}
              </h2>
              <p className={styles.trustText}>{tp("trust.text")}</p>
            </div>
            <ul className={styles.trustLinks}>
              {TRUST_LINKS.map(({ key, doc }) => (
                <li key={key}>
                  <Link href={`/legal?doc=${doc}`}>
                    {tp(`trust.${key}`)}
                    <ArrowUpRight
                      size={16}
                      strokeWidth={2.2}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <FinalCta secondaryHref="/pricing" secondaryLabelKey="pricing" />
    </SiteShell>
  );
}
