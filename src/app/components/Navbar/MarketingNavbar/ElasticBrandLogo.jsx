"use client";

import { useEffect, useRef } from "react";
import styles from "./navbar.module.css";
import { LOGO_SYMBOL } from "./brandLogoPaths";

// Logo = símbolo em SVG inline (path em brandLogoPaths.js) + "MyDigitalBot"
// em texto com a Inter do site. Antes era o mesmo PNG carregado duas vezes e
// cortado com clip-path, e era o elemento LCP. Agora não há imagem nem fonte
// extra para descarregar. (O original usa Segoe UI Bold, que não se pode
// servir como webfont; a Inter 700 ocupa a mesma largura.)
function LogoSymbol({ symbolRef }) {
  const { box } = LOGO_SYMBOL;
  return (
    <svg
      ref={symbolRef}
      className={styles.logoSymbol}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={LOGO_SYMBOL.d} fill={LOGO_SYMBOL.color} fillRule="evenodd" />
    </svg>
  );
}

const MAX_TRANSLATE_X = 2.4;
const MAX_TRANSLATE_Y = 1.8;
const MAX_ROTATION = 1.4;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function ElasticBrandLogo() {
  const hitAreaRef = useRef(null);
  const symbolRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const canTrackPointerRef = useRef(false);
  const physicsRef = useRef({
    x: 0,
    y: 0,
    press: 0,
    velocityX: 0,
    velocityY: 0,
    pressVelocity: 0,
    targetX: 0,
    targetY: 0,
    targetPress: 0,
    frame: null,
    lastTime: 0,
  });

  function renderSymbol() {
    const symbol = symbolRef.current;
    if (!symbol) return;

    const { x, y, press } = physicsRef.current;
    const visualX = clamp(x, -1, 1);
    const visualY = clamp(y, -1, 1);
    const visualPress = clamp(press, 0, 1);
    const horizontalPull = Math.abs(visualX);
    const verticalPull = Math.abs(visualY);
    const scaleX =
      1 + horizontalPull * 0.014 - verticalPull * 0.008 - visualPress * 0.012;
    const scaleY =
      1 + verticalPull * 0.012 - horizontalPull * 0.009 - visualPress * 0.012;
    const rotation = clamp(
      visualX * MAX_ROTATION - visualY * 0.25,
      -MAX_ROTATION,
      MAX_ROTATION,
    );

    symbol.style.transform = `translate3d(${visualX * MAX_TRANSLATE_X}px, ${
      visualY * MAX_TRANSLATE_Y
    }px, 0) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;
  }

  function stopAndReset() {
    const physics = physicsRef.current;
    if (physics.frame !== null) {
      cancelAnimationFrame(physics.frame);
    }

    Object.assign(physics, {
      x: 0,
      y: 0,
      press: 0,
      velocityX: 0,
      velocityY: 0,
      pressVelocity: 0,
      targetX: 0,
      targetY: 0,
      targetPress: 0,
      frame: null,
      lastTime: 0,
    });

    if (symbolRef.current) {
      symbolRef.current.style.transform = "";
    }
  }

  function startSpring() {
    const physics = physicsRef.current;
    if (reducedMotionRef.current || physics.frame !== null) return;

    const tick = (time) => {
      const state = physicsRef.current;
      const frameScale = state.lastTime
        ? Math.min((time - state.lastTime) / 16.667, 2)
        : 1;
      state.lastTime = time;

      const spring = 0.13;
      const damping = Math.pow(0.78, frameScale);

      state.velocityX =
        (state.velocityX + (state.targetX - state.x) * spring * frameScale) *
        damping;
      state.velocityY =
        (state.velocityY + (state.targetY - state.y) * spring * frameScale) *
        damping;
      state.pressVelocity =
        (state.pressVelocity +
          (state.targetPress - state.press) * spring * frameScale) *
        damping;

      state.x += state.velocityX * frameScale;
      state.y += state.velocityY * frameScale;
      state.press += state.pressVelocity * frameScale;

      renderSymbol();

      const settled =
        Math.abs(state.targetX - state.x) < 0.001 &&
        Math.abs(state.targetY - state.y) < 0.001 &&
        Math.abs(state.targetPress - state.press) < 0.001 &&
        Math.abs(state.velocityX) < 0.001 &&
        Math.abs(state.velocityY) < 0.001 &&
        Math.abs(state.pressVelocity) < 0.001;

      if (settled) {
        state.x = state.targetX;
        state.y = state.targetY;
        state.press = state.targetPress;
        state.velocityX = 0;
        state.velocityY = 0;
        state.pressVelocity = 0;
        state.frame = null;
        state.lastTime = 0;
        renderSymbol();
        return;
      }

      state.frame = requestAnimationFrame(tick);
    };

    physics.frame = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncPreferences = () => {
      reducedMotionRef.current = reducedMotion.matches;
      canTrackPointerRef.current = finePointer.matches;

      if (reducedMotion.matches) {
        stopAndReset();
      }
    };

    syncPreferences();
    reducedMotion.addEventListener("change", syncPreferences);
    finePointer.addEventListener("change", syncPreferences);

    return () => {
      reducedMotion.removeEventListener("change", syncPreferences);
      finePointer.removeEventListener("change", syncPreferences);
      const frame = physicsRef.current.frame;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  function handlePointerMove(event) {
    if (
      reducedMotionRef.current ||
      !canTrackPointerRef.current ||
      event.pointerType !== "mouse"
    ) {
      return;
    }

    const bounds = hitAreaRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const state = physicsRef.current;
    state.targetX = clamp(
      (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2),
      -1,
      1,
    );
    state.targetY = clamp(
      (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2),
      -1,
      1,
    );
    startSpring();
  }

  function handlePointerLeave() {
    const state = physicsRef.current;
    state.targetX = 0;
    state.targetY = 0;
    state.targetPress = 0;
    startSpring();
  }

  function handlePointerDown() {
    if (reducedMotionRef.current) return;
    physicsRef.current.targetPress = 1;
    startSpring();
  }

  function handlePointerUp() {
    physicsRef.current.targetPress = 0;
    startSpring();
  }

  return (
    <span
      className={styles.logoVisual}
      role="img"
      aria-label="MyDigitalBot logo"
    >
      <LogoSymbol symbolRef={symbolRef} />
      <span className={styles.logoWordmark} aria-hidden="true">
        MyDigitalBot
      </span>
      <span
        ref={hitAreaRef}
        className={styles.logoHitArea}
        aria-hidden="true"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerLeave}
      />
    </span>
  );
}
