import LogoPattern from "./LogoPattern";
import LogoPatternStatic from "./LogoPatternStatic";
import site from "./site.module.css";

// Fundo de todos os heroes: logos do MyDigitalBot em contorno, a deslizar.
// Valores do preset "site" do Logo Pattern no bg-lab.
const PATTERN_PROPS = {
  size: 30,
  spacing: 260,
  speed: 14,
  direction: -35,
  tilt: -12,
  tiltSpread: 12,
  jitter: 0.6,
  wobble: 8,
  pulse: 0.05,
  filled: false,
  strokeWidth: 1.6,
  gradient: true,
};

// O LogoPatternStatic (SVG gerado no servidor) mostra os logos logo com o
// HTML; o canvas animado substitui-o quando o JS arranca.
export default function HeroPattern() {
  return (
    <div className={site.heroPattern} aria-hidden="true">
      <LogoPattern {...PATTERN_PROPS}>
        <LogoPatternStatic id="hero-pattern" {...PATTERN_PROPS} />
      </LogoPattern>
    </div>
  );
}
