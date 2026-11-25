import {
  EYE,
  EYE_OFFSET,
  GRADIENT_FROM,
  GRADIENT_LINE,
  GRADIENT_TO,
  SMILE,
  VIEW,
  forEachLogo,
  normalizeSettings,
} from "./logoPatternGrid";

// Primeiro frame do LogoPattern em SVG, gerado no servidor (vem no HTML).
// Mostra os logos logo no primeiro paint; o LogoPattern troca-o pelo canvas
// animado quando o JS arranca. Usa a mesma grelha (forEachLogo, instante 0),
// por isso a troca não se nota. Não conhece as zonas livres
// (data-pattern-safe), que dependem do layout no browser.

// Área coberta: chega para heroes até 2560 x 1600 px; o resto é cortado.
const COVER_WIDTH = 2560;
const COVER_HEIGHT = 1600;

const round = (n) => Math.round(n * 100) / 100;

export default function LogoPatternStatic({ id = "logo-pattern", ...props }) {
  const s = normalizeSettings(props);
  const symbolId = `${id}-symbol`;
  const gradientId = `${id}-gradient`;
  const paint = s.gradient ? `url(#${gradientId})` : s.color;
  const cx = VIEW.x + VIEW.w / 2;
  const cy = VIEW.y + VIEW.h / 2;

  const logos = [];
  forEachLogo(s, 0, COVER_WIDTH, COVER_HEIGHT, (x, y, angle, scale) => {
    const k = (s.size / VIEW.w) * scale;
    logos.push(
      `translate(${round(x)} ${round(y)}) rotate(${round(angle)}) ` +
        `scale(${round(k * 10000) / 10000}) translate(${-cx} ${-cy})`,
    );
  });

  const shape = s.filled
    ? { fill: paint }
    : {
        fill: "none",
        stroke: paint,
        strokeWidth: s.strokeWidth,
        strokeLinejoin: "round",
        vectorEffect: "non-scaling-stroke",
      };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        display: "block",
      }}
    >
      <defs>
        {s.gradient && (
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={GRADIENT_LINE.x1}
            y1={GRADIENT_LINE.y1}
            x2={GRADIENT_LINE.x2}
            y2={GRADIENT_LINE.y2}
          >
            <stop offset="0" stopColor={GRADIENT_FROM} />
            <stop offset="1" stopColor={GRADIENT_TO} />
          </linearGradient>
        )}
        <g id={symbolId}>
          <path d={SMILE} {...shape} />
          <path d={EYE} {...shape} />
          <path d={EYE} transform={`translate(${EYE_OFFSET} 0)`} {...shape} />
        </g>
      </defs>
      {logos.map((transform, index) => (
        <use key={index} href={`#${symbolId}`} transform={transform} />
      ))}
    </svg>
  );
}
