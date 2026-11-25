import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import LoaderLink from "../TopLoader/LoaderLink";
import site from "./site.module.css";

/**
 * Fecho comum a todas as páginas: pedido de demonstração, com o render 3D do
 * símbolo em vidro. O botão secundário muda por página (secondaryHref).
 */
export default async function FinalCta({
  secondaryHref = "/how-it-works",
  secondaryLabelKey = "secondary",
}) {
  const t = await getTranslations("HomeV2.final");

  return (
    <section className={site.final} aria-labelledby="final-cta-title">
      <Image
        className={site.finalImage}
        // Teste 24-11-2026: sorriso em vidro cristalino (azul). O anterior
        // era /images/hero/product-glass-symbol.jpg (1672x941).
        src="/images/hero/sorriso-vidro-cristalino.webp"
        alt=""
        width={1535}
        height={1025}
        sizes="(max-width: 960px) 100vw, 62vw"
      />
      <div className={site.wrap}>
        <div className={`${site.finalCopy} ${site.reveal}`}>
          <h2 className={site.finalTitle} id="final-cta-title">
            {t("title")}
          </h2>
          <p className={site.finalText}>{t("text")}</p>
          <div className={site.finalActions}>
            <LoaderLink href="/contact" className={site.primary}>
              {t("primary")}
              <ArrowRight size={17} strokeWidth={2.3} aria-hidden="true" />
            </LoaderLink>
            <LoaderLink href={secondaryHref} className={site.secondary}>
              {t(secondaryLabelKey)}
            </LoaderLink>
          </div>
        </div>
      </div>
    </section>
  );
}
