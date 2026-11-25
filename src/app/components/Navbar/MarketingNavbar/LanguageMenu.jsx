"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { Check, Globe } from "lucide-react";
import { localeOptions } from "@/i18n/localeMeta";
import styles from "./languageMenu.module.css";

// Language dropdown used across the marketing header. Available locales
// (and their labels) come from src/i18n/localeMeta.js, which is itself
// derived from the existing next-intl routing config (src/i18n/routing.js)
// — adding a locale there is enough for it to show up here.
const EMPTY_QUERY = {};

// useSearchParams needs a <Suspense> above it so pages can be static. The
// fallback (which ends up in the build-time HTML) is the same menu without
// the URL's query params; the browser fills them in right after.
export default function LanguageMenu(props) {
  return (
    <Suspense fallback={<LanguageMenuView {...props} query={EMPTY_QUERY} />}>
      <LanguageMenuWithQuery {...props} />
    </Suspense>
  );
}

function LanguageMenuWithQuery(props) {
  const searchParams = useSearchParams();
  // Preserve whatever query params are already on the URL when switching.
  const query = useMemo(
    () => Object.fromEntries(searchParams.entries()),
    [searchParams],
  );
  return <LanguageMenuView {...props} query={query} />;
}

function LanguageMenuView({ className = "", query }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Lang");

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  // Source of truth for the code shown on the trigger: derived from the
  // current locale via localeOptions (itself derived from routing.js), so a
  // future locale needs no trigger changes — see src/i18n/localeMeta.js.
  const activeOption =
    localeOptions.find((option) => option.code === locale) ??
    localeOptions[0];

  // Click outside + Escape to close.
  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Move focus onto the active language whenever the menu opens.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const items = rootRef.current.querySelectorAll('[role="menuitem"]');
    const activeIndex = localeOptions.findIndex((opt) => opt.code === locale);
    const target = items[activeIndex >= 0 ? activeIndex : 0];
    target?.focus();
  }, [open, locale]);

  function focusItemAt(index) {
    if (!rootRef.current) return;
    const items = Array.from(
      rootRef.current.querySelectorAll('[role="menuitem"]'),
    );
    if (!items.length) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function handleTriggerKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleItemKeyDown(event, index) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItemAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItemAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItemAt(localeOptions.length - 1);
    }
  }

  // Close the menu whenever focus leaves the whole component (e.g. Tab).
  function handleBlur(event) {
    const next = event.relatedTarget;
    if (rootRef.current && (!next || !rootRef.current.contains(next))) {
      setOpen(false);
    }
  }

  return (
    <div
      className={`${styles.root} ${className}`}
      ref={rootRef}
      onBlur={handleBlur}
    >
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("triggerLabel", { language: activeOption.label })}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <Globe size={18} aria-hidden="true" />
        <span className={styles.code} aria-hidden="true">
          {activeOption.short}
        </span>
      </button>

      <div
        id={menuId}
        role="menu"
        className={styles.menu}
        aria-label={t("ariaLabel")}
        data-open={open || undefined}
      >
        {localeOptions.map((option, index) => {
          const isActive = option.code === locale;
          return (
            <Link
              key={option.code}
              role="menuitem"
              href={{ pathname, query }}
              locale={option.code}
              prefetch={false}
              tabIndex={open ? undefined : -1}
              aria-current={isActive ? "true" : undefined}
              aria-label={t("switchTo", { code: option.label })}
              className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
              onClick={() => setOpen(false)}
              onKeyDown={(event) => handleItemKeyDown(event, index)}
            >
              <span className={styles.itemCheck} aria-hidden="true">
                {isActive ? <Check size={15} /> : null}
              </span>
              <span className={styles.itemLabel}>{option.label}</span>
              <span className={styles.itemShort} aria-hidden="true">
                {option.short}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
