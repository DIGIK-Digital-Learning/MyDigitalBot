import { ArrowRight } from "lucide-react";
import LoaderLink from "../TopLoader/LoaderLink";
import BrandSymbol from "../HomeV2/BrandSymbol";
import site from "./site.module.css";

/**
 * Topo escuro das páginas interiores. Com `aside` fica em duas colunas
 * (texto + imagem/formulário); sem `aside` fica só o texto, alinhado à
 * esquerda. O primeiro botão leva data-page-demo-cta para o cabeçalho saber
 * quando mostrar o seu próprio "Pedir demonstração".
 */
export default function PageHero({
  title,
  lead,
  actions = [],
  aside,
  children,
}) {
  const copy = (
    <div className={site.pageHeroCopy}>
      <h1 className={site.pageHeroTitle}>{title}</h1>
      {lead ? <p className={site.pageHeroLead}>{lead}</p> : null}
      {actions.length ? (
        <div className={site.pageHeroActions}>
          {actions.map((action, index) => (
            <LoaderLink
              key={action.href + action.label}
              href={action.href}
              className={index === 0 ? site.primary : site.secondary}
              {...(index === 0 ? { "data-page-demo-cta": true } : {})}
            >
              {action.label}
              {index === 0 ? (
                <ArrowRight size={17} strokeWidth={2.3} aria-hidden="true" />
              ) : null}
            </LoaderLink>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );

  return (
    <section className={site.pageHero}>
      <BrandSymbol className={site.pageHeroSymbol} />
      <div className={site.wrap}>
        {aside ? (
          <div className={site.pageHeroGrid}>
            {copy}
            <div className={site.pageHeroAside}>{aside}</div>
          </div>
        ) : (
          <div className={site.pageHeroCenter}>{copy}</div>
        )}
      </div>
    </section>
  );
}
