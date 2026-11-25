// Símbolo do MyDigitalBot (o balão a sorrir), isolado do logo vetorial em
// /public/images/Logos/logo-24.svg. Os olhos têm classe própria para poderem
// piscar sem mexer no resto.
const SYMBOL_PATH =
  "M384.9,188.75c20.55-29.6,32.69-65.47,32.69-104.16,0-2.42-.14-4.81-.3-7.19l-.14-2.05-54.48,2.9.17,2.85c.09,1.16.18,2.32.18,3.5,0,70.91-57.69,128.61-128.6,128.61S105.82,155.5,105.82,84.59c0-1.11.1-2.2.17-3.29l.19-3.16-54.5-2.67-.14,2.15c-.15,2.31-.29,4.62-.29,6.98,0,101,82.17,183.17,183.17,183.17,39.51,0,76.04-12.71,106-34.07l66.12,29.21-21.65-74.14Z";

const EYE_PATH =
  "M173.49,98.62c10.39,0,19.79,4.18,26.67,10.91,7.09-6.93,11.52-16.58,11.52-27.28,0-21.09-17.1-38.19-38.19-38.19s-38.19,17.1-38.19,38.19c0,10.7,4.43,20.35,11.52,27.28,6.89-6.73,16.28-10.91,26.67-10.91Z";

// Cores do símbolo no logo: verde-água em baixo à esquerda, azul em cima à direita.
const GRADIENT_FROM = "#34d7b6";
const GRADIENT_TO = "#4ab0ff";

// gradientId: pinta com o gradiente da marca. O id tem de ser único na página
// (o componente não usa hooks para poder ser server). Com outline desenha só
// o contorno; sem outline fica cheio.
export default function BrandSymbol({
  className,
  eyeClassName,
  title,
  gradientId,
  outline = false,
  ...rest
}) {
  const color = gradientId ? `url(#${gradientId})` : "currentColor";
  const paint = outline ? { fill: "none", stroke: color } : { fill: color };

  return (
    <svg
      {...rest}
      className={className}
      viewBox="45 35 380 240"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {gradientId ? (
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="60"
            y1="270"
            x2="420"
            y2="40"
          >
            <stop offset="0" stopColor={GRADIENT_FROM} />
            <stop offset="1" stopColor={GRADIENT_TO} />
          </linearGradient>
        </defs>
      ) : null}
      <path d={SYMBOL_PATH} {...paint} />
      <g className={eyeClassName}>
        <path d={EYE_PATH} {...paint} />
        <path d={EYE_PATH} {...paint} transform="translate(118.05 0)" />
      </g>
    </svg>
  );
}
