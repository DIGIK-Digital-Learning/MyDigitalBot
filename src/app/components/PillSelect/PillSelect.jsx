"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import styles from "./pillSelect.module.css";

const MIN_MENU_WIDTH = 240;

export default function PillSelect({
  options = [],
  value,
  onChange,
  placeholder,
  disabled = false,
  menuWidth,
  portalToBody = true,
  fullWidth = false,
  className = "",
  style,
}) {
  const t = useTranslations("PillSelect");
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });
  const [direction, setDirection] = useState("down");

  const selected = options.find((o) => String(o.value) === String(value));
  const label = selected?.label ?? placeholder ?? t("placeholder");

  useEffect(() => {
    if (!open) return;

    function onDoc(e) {
      if (menuRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }

    function onResize() {
      reposition();
    }

    function onScroll() {
      reposition();
    }

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onResize);
    document.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const reposition = () => {
    if (!open || !triggerRef.current) return;

    const r = triggerRef.current.getBoundingClientRect();
    // A short selected label makes a narrow trigger; the menu keeps room for the other options.
    const width =
      menuWidth ??
      Math.min(Math.max(r.width, MIN_MENU_WIDTH), window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left));

    const downTop = r.bottom + 6;
    setPos((p) => ({ ...p, top: downTop, left, width }));

    requestAnimationFrame(() => {
      const mh = menuRef.current?.getBoundingClientRect().height ?? 0;
      const spaceBelow = window.innerHeight - (r.bottom + 6) - 12;
      const spaceAbove = r.top - 6 - 12;

      if (mh > spaceBelow && spaceAbove > spaceBelow) {
        const upTop = Math.max(12, r.top - 6 - mh);
        setDirection("up");
        setPos({ top: upTop, left, width });
      } else {
        const clampedDown = Math.min(downTop, window.innerHeight - mh - 12);
        setDirection("down");
        setPos({ top: clampedDown, left, width });
      }
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, menuWidth, options.length]);

  const menuEl = (
    <div
      ref={menuRef}
      className={`${styles.menu} ${direction === "up" ? styles.menuUp : ""}`}
      role="listbox"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className={styles.list}>
        {options.map((o) => {
          const active = String(o.value) === String(value);
          return (
            <button
              key={o.value}
              role="option"
              aria-selected={active}
              className={`${styles.item} ${active ? styles.itemActive : ""}`}
              onClick={() => {
                onChange?.(o.value);
                setOpen(false);
              }}
            >
              <span className={styles.itemLabel}>{o.label}</span>
              {active && (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className={styles.check}
                >
                  <path d="M20 6L9 17l-5-5" strokeWidth="2" />
                </svg>
              )}
            </button>
          );
        })}
        {!options.length && <div className={styles.empty}>{t("empty")}</div>}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`${styles.trigger} ${fullWidth ? styles.full : ""} ${className}`}
        style={style}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <span className={styles.label}>{label}</span>
        <svg
          className={styles.caret}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M6 9l6 6 6-6" strokeWidth="2" />
        </svg>
      </button>

      {open && (portalToBody ? createPortal(menuEl, document.body) : menuEl)}
    </>
  );
}
