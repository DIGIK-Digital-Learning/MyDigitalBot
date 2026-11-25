// Geometria do padrão de logos, partilhada pelo canvas animado (LogoPattern)
// e pelo primeiro frame estático em SVG (LogoPatternStatic). Os dois usam
// esta mesma função, por isso o SVG que vem no HTML coincide com o primeiro
// frame do canvas e a troca não se nota.

// Símbolo do MyDigitalBot (mesmos paths do BrandSymbol do site).
export const SMILE =
  'M384.9,188.75c20.55-29.6,32.69-65.47,32.69-104.16,0-2.42-.14-4.81-.3-7.19l-.14-2.05-54.48,2.9.17,2.85c.09,1.16.18,2.32.18,3.5,0,70.91-57.69,128.61-128.6,128.61S105.82,155.5,105.82,84.59c0-1.11.1-2.2.17-3.29l.19-3.16-54.5-2.67-.14,2.15c-.15,2.31-.29,4.62-.29,6.98,0,101,82.17,183.17,183.17,183.17,39.51,0,76.04-12.71,106-34.07l66.12,29.21-21.65-74.14Z';
export const EYE =
  'M173.49,98.62c10.39,0,19.79,4.18,26.67,10.91,7.09-6.93,11.52-16.58,11.52-27.28,0-21.09-17.1-38.19-38.19-38.19s-38.19,17.1-38.19,38.19c0,10.7,4.43,20.35,11.52,27.28,6.89-6.73,16.28-10.91,26.67-10.91Z';
// Distância entre os dois olhos, no espaço do viewBox.
export const EYE_OFFSET = 118.05;
export const VIEW = { x: 45, y: 35, w: 380, h: 240 };
export const GRADIENT_FROM = '#34d7b6';
export const GRADIENT_TO = '#4ab0ff';
// Linha do gradiente, no espaço do viewBox (igual no canvas e no SVG).
export const GRADIENT_LINE = { x1: 60, y1: 270, x2: 420, y2: 40 };

// Número pseudo-aleatório estável por logo (posição, inclinação, fase).
export const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Props do componente -> valores com limites aplicados.
export function normalizeSettings({
  size = 34,
  spacing = 150,
  speed = 18,
  direction = -30,
  tilt = -12,
  tiltSpread = 12,
  jitter = 0.6,
  wobble = 8,
  pulse = 0.06,
  filled = true,
  gradient = true,
  color = '#ffffff',
  strokeWidth = 2,
  backgroundColor = 'transparent',
  paused = false,
} = {}) {
  return {
    size: Math.max(6, size),
    spacing: Math.max(20, spacing),
    speed,
    direction,
    tilt,
    tiltSpread,
    jitter: Math.min(0.9, Math.max(0, jitter)),
    wobble,
    pulse,
    filled,
    gradient,
    color,
    strokeWidth,
    backgroundColor,
    paused,
  };
}

// Chama fn(x, y, angle, scale) para cada logo do frame no instante `time`
// (segundos), numa área width x height em px a partir do canto superior
// esquerdo.
export function forEachLogo(s, time, width, height, fn) {
  const gap = s.spacing;
  const rad = (s.direction * Math.PI) / 180;
  const sx = Math.cos(rad) * s.speed * time;
  const sy = Math.sin(rad) * s.speed * time;
  // A grelha repete-se a cada "gap" na horizontal e a cada 2 linhas na
  // vertical (linhas ímpares desencontradas). Os índices "do mundo" mantêm
  // a fase de cada logo quando a grelha dá a volta.
  const kx = Math.floor(sx / gap);
  const ky = Math.floor(sy / (2 * gap));
  const offX = sx - kx * gap;
  const offY = sy - ky * 2 * gap;
  const cols = Math.ceil(width / gap) + 3;
  const rows = Math.ceil(height / gap) + 4;

  for (let r = -2; r < rows; r += 1) {
    for (let c = -2; c < cols; c += 1) {
      const worldR = r - 2 * ky;
      const worldC = c - kx;
      // Desvio fixo por logo, para parecer espalhado e não uma grelha.
      const jx = (hash(worldR + 17.3, worldC) - 0.5) * gap * s.jitter;
      const jy = (hash(worldR, worldC + 41.7) - 0.5) * gap * s.jitter;
      const x = c * gap + (Math.abs(worldR) % 2 ? gap / 2 : 0) + offX + jx;
      const y = r * gap + offY + jy;
      const phase = hash(worldR, worldC) * Math.PI * 2;
      const tiltSpread = (hash(worldC, worldR) - 0.5) * 2 * s.tiltSpread;
      const angle = s.tilt + tiltSpread + s.wobble * Math.sin(time * 1.4 + phase);
      const scale = 1 + s.pulse * Math.sin(time * 2 + phase);
      fn(x, y, angle, scale);
    }
  }
}
