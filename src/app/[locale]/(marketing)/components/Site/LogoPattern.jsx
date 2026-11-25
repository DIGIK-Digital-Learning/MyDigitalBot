"use client";

import { useEffect, useRef, useState } from 'react';
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
} from './logoPatternGrid';

// Padrão de logos em loop contínuo: símbolos do MyDigitalBot numa grelha
// desencontrada, inclinados, a deslizar numa direção, cada um com um leve
// balanço. Canvas 2D (funciona em qualquer browser, sem WebGPU).
// Copiado do bg-lab (Desktop/.../MyDigitalBot/bg-lab), onde os valores foram
// afinados. backgroundColor="transparent" deixa ver o fundo da secção.
//
// Zonas livres: os logos desaparecem (com fade) quando passam por cima de
// qualquer elemento com o atributo data-pattern-safe dentro da mesma secção
// (botões de CTA, faixa de vantagens, símbolo grande...). Com
// data-pattern-safe="items" cada filho conta como zona à parte (útil para uma
// linha de botões, cujo contentor ocupa a largura toda).
//
// children: primeiro frame já desenhado no servidor (LogoPatternStatic),
// para os logos aparecerem com o HTML e não só quando o JS carrega. Sai
// assim que o canvas pinta o primeiro frame, que é igual.

// Margem à volta de cada zona livre: até aqui o logo já sumiu; o fade
// acontece nos SAFE_FADE px seguintes.
const SAFE_PADDING = 14;
const SAFE_FADE = 36;

export default function LogoPattern({ className = '', children, ...props }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const settingsRef = useRef(null);
  const [live, setLive] = useState(false);
  settingsRef.current = normalizeSettings(props);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const smile = new Path2D(SMILE);
    const eye = new Path2D(EYE);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frameId = 0;
    let visible = true;
    let time = 0;
    let last = 0;
    let painted = false;
    let safeElements = [];
    let zones = [];

    // Elementos marcados com data-pattern-safe na secção do fundo.
    const findSafeElements = () => {
      const scope = root.closest('section') ?? root.parentElement ?? document;
      safeElements = Array.from(scope.querySelectorAll('[data-pattern-safe]')).flatMap(
        (el) => (el.dataset.patternSafe === 'items' ? Array.from(el.children) : [el])
      );
    };

    // Retângulos das zonas livres, em px relativos ao canvas. Medidos em cada
    // frame porque os elementos entram com animação e o layout pode mudar.
    const measureZones = (pad) => {
      const box = root.getBoundingClientRect();
      zones = safeElements.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left - box.left - pad,
          top: r.top - box.top - pad,
          right: r.right - box.left + pad,
          bottom: r.bottom - box.top + pad,
        };
      });
    };

    // 1 = logo normal; 0 = dentro de uma zona livre.
    const safeAlpha = (x, y) => {
      let alpha = 1;
      for (const z of zones) {
        const dx = Math.max(z.left - x, 0, x - z.right);
        const dy = Math.max(z.top - y, 0, y - z.bottom);
        const distance = Math.hypot(dx, dy);
        if (distance < SAFE_FADE) alpha = Math.min(alpha, distance / SAFE_FADE);
        if (alpha === 0) break;
      }
      return alpha;
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawLogo = (s, x, y, angle, scale) => {
      const alpha = safeAlpha(x, y);
      if (alpha <= 0) return;
      const k = (s.size / VIEW.w) * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(k, k);
      ctx.translate(-(VIEW.x + VIEW.w / 2), -(VIEW.y + VIEW.h / 2));
      let paint = s.color;
      if (s.gradient) {
        const g = GRADIENT_LINE;
        paint = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
        paint.addColorStop(0, GRADIENT_FROM);
        paint.addColorStop(1, GRADIENT_TO);
      }
      if (s.filled) {
        ctx.fillStyle = paint;
        ctx.fill(smile);
        ctx.fill(eye);
        ctx.translate(EYE_OFFSET, 0);
        ctx.fill(eye);
      } else {
        ctx.strokeStyle = paint;
        ctx.lineWidth = s.strokeWidth / k; // espessura constante em px
        ctx.lineJoin = 'round';
        ctx.stroke(smile);
        ctx.stroke(eye);
        ctx.translate(EYE_OFFSET, 0);
        ctx.stroke(eye);
      }
      ctx.restore();
    };

    const draw = () => {
      const s = settingsRef.current;
      if (!s.backgroundColor || s.backgroundColor === 'transparent') {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = s.backgroundColor;
        ctx.fillRect(0, 0, width, height);
      }

      // A zona cresce meio logo, para nenhuma ponta ficar por cima.
      measureZones(SAFE_PADDING + s.size / 2);
      forEachLogo(s, time, width, height, (x, y, angle, scale) =>
        drawLogo(s, x, y, angle, scale)
      );

      // Primeiro frame no canvas: já pode sair o frame estático do servidor.
      if (!painted) {
        painted = true;
        setLive(true);
      }
    };

    const tick = (now) => {
      frameId = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const s = settingsRef.current;
      const still = s.paused || reduceMotion.matches;
      if (!still) time += dt;
      draw();
      if (!still && visible) frameId = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!frameId) {
        last = 0;
        frameId = requestAnimationFrame(tick);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      findSafeElements();
      resize();
      wake();
    });
    resizeObserver.observe(root);
    const visibilityObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) wake();
    });
    visibilityObserver.observe(root);
    reduceMotion.addEventListener('change', wake);

    findSafeElements();
    resize();
    wake();
    // Mudanças de props (incluindo "paused") acordam o desenho.
    root.__wakeLogoPattern = wake;

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      reduceMotion.removeEventListener('change', wake);
    };
  }, []);

  useEffect(() => {
    rootRef.current?.__wakeLogoPattern?.();
  });

  return (
    <div
      ref={rootRef}
      className={`logo-pattern ${className}`}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      aria-hidden="true"
    >
      {!live && children}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
