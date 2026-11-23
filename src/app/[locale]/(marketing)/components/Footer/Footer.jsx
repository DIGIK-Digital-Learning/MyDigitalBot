import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Linkedin,
  Mail,
  ShieldCheck,
  Youtube,
} from "lucide-react";
import { digikUrl } from "@/lib/seo/metadata";
import BrandSymbol from "../HomeV2/BrandSymbol";
import styles from "./Footer.module.css";
import content from "./footer.json";

const SOCIAL_ICONS = { linkedin: Linkedin, youtube: Youtube };
// Ícones dos links de contacto (campo "icon" no footer.json), para se
// distinguirem logo dos links de navegação.
const LINK_ICONS = { company: Building2, email: Mail };

function FooterLink({ link, label, digikHref }) {
  if (link.external) {
    const href = link.href === "digik" ? digikHref : link.href;
    const isMail = href.startsWith("mailto:");
    const Icon = LINK_ICONS[link.icon];
    return (
      <a
        className={`${styles.link} ${Icon ? styles.linkWithIcon : ""}`}
        href={href}
        {...(isMail ? {} : { target: "_blank", rel: "noopener" })}
      >
        {Icon ? (
          <span className={styles.linkIcon} aria-hidden="true">
            <Icon size={15} strokeWidth={2} />
          </span>
        ) : null}
        <span>{label}</span>
        {Icon && !isMail ? (
          <ArrowUpRight
            className={styles.linkExternal}
            size={14}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        ) : null}
      </a>
    );
  }

  return (
    <Link className={styles.link} href={link.href}>
      {label}
    </Link>
  );
}

export default function Footer() {
  const t = useTranslations("LandingPage.Footer");
  const locale = useLocale();
  const digikHref = digikUrl(locale);
  const year = new Date().getFullYear();

  return (
    <footer className={styles.wrap}>
      <BrandSymbol className={styles.symbol} />

      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <Link href="/" className={styles.brandRow}>
              <Image
                src="/images/Logos/Logo.png"
                alt=""
                width={45}
                height={28}
              />
              <span className={styles.brandName}>{content.brand}</span>
            </Link>

            <p className={styles.tagline}>{t("tagline")}</p>

            <div className={styles.socials}>
              {content.socials.map((s) => {
                const Icon = SOCIAL_ICONS[s.icon];
                return (
                  <a
                    key={s.href}
                    href={s.href}
                    aria-label={t(s.labelKey)}
                    className={styles.socialBtn}
                    target="_blank"
                    rel="noopener"
                  >
                    {Icon ? (
                      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                    ) : null}
                  </a>
                );
              })}
            </div>

            <Link href="/contact" className={styles.cta}>
              {t("cta")}
              <ArrowRight size={16} strokeWidth={2.3} aria-hidden="true" />
            </Link>
          </div>

          <nav className={styles.cols} aria-label={content.brand}>
            {content.columns.map((col) => (
              <div
                key={col.titleKey}
                className={`${styles.col} ${
                  col.links.some((l) => l.icon) ? styles.colContact : ""
                }`}
              >
                <p className={styles.colTitle}>{t(col.titleKey)}</p>
                <ul className={styles.links}>
                  {col.links.map((l) => (
                    <li key={l.href + l.labelKey}>
                      <FooterLink
                        link={l}
                        label={t(l.labelKey)}
                        digikHref={digikHref}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.bottom}>
          <p className={styles.copy}>
            © {year} {content.brand} · {t("maker.prefix")}{" "}
            <a href={digikHref} target="_blank" rel="noopener">
              DIGIK - Digital Learning
            </a>
          </p>

          <Link
            className={styles.badge}
            href="/legal?doc=data-processing-agreement"
          >
            <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
            {t("badges.gdpr")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
