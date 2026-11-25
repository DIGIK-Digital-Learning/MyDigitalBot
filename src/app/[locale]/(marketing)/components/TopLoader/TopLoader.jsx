"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./topLoader.module.css";

let startLoaderGlobal = null;
let doneLoaderGlobal = null;

export function startTopLoader() {
  startLoaderGlobal?.();
}

export function doneTopLoader() {
  doneLoaderGlobal?.();
}

// useSearchParams precisa de um <Suspense> por cima para as páginas poderem
// ser estáticas. A barra começa escondida, por isso o fallback é vazio.
export default function TopLoader() {
  return (
    <Suspense fallback={null}>
      <TopLoaderBar />
    </Suspense>
  );
}

function TopLoaderBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef(null);
  const fallbackRef = useRef(null);
  const firstRenderRef = useRef(true);

  function clearTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }

  function start() {
    clearTimers();
    setVisible(true);
    setProgress(12);

    timerRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 85) return current;
        return current + Math.max((90 - current) * 0.12, 2);
      });
    }, 140);

    fallbackRef.current = setTimeout(() => {
      done();
    }, 900);
  }

  function done() {
    clearTimers();
    setProgress(100);

    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }

  useEffect(() => {
    startLoaderGlobal = start;
    doneLoaderGlobal = done;

    return () => {
      if (startLoaderGlobal === start) startLoaderGlobal = null;
      if (doneLoaderGlobal === done) doneLoaderGlobal = null;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    done();
  }, [pathname, searchParams]);

  return (
    <div
      className={`${styles.wrap} ${visible ? styles.wrapVisible : ""}`}
      aria-hidden="true"
    >
      <div
        className={styles.bar}
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
