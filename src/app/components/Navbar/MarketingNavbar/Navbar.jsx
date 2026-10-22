"use client";

import { useState, useMemo, useEffect } from "react";
import LoaderLink from "@/app/[locale]/(marketing)/components/TopLoader/LoaderLink";
import styles from "./navbar.module.css";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import createClient from "@/utils/supabase/client";

const NAV = [
  { href: "/solution", key: "solution" },
  { href: "/product", key: "product" },
  { href: "/how-it-works", key: "how-it-works" },

  { href: "/pricing", key: "pricing" },

  //{ href: "/company", key: "company" },
  //{ href: "/support", key: "support" },
  //{ href: "/learn", key: "learn" },
  // { href: "/blog", key: "blog" },
];

export default function MarketingNavbar() {
  const translation = useTranslations("LandingPage.Hero.Nav");
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setIsAuthed(!!session);
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted: (false, subscription.unsubscribe());
    };
  }, [supabase]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <header className={styles.navWrap}>
      <nav className={styles.navbar}>
        <div className={styles.topBar}>
          <LoaderLink href="/" className={styles.brand} onClick={closeMenu}>
            <Image
              src="/images/Logos/Logo cor e branco.png"
              alt="MyDigitalBot logo"
              width={2047}
              height={276}
              className={styles.logoMark}
              priority
              unoptimized
            />
            {/* <span className={styles.brandText}>MyDigitalBot</span> */}
          </LoaderLink>

          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-controls="marketing-navigation"
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div
          id="marketing-navigation"
          className={`${styles.navContent} ${isOpen ? styles.open : ""}`}
        >
          <div className={styles.navLinks}>
            {NAV.map((item) => (
              <LoaderLink
                key={item.href}
                href={item.href}
                className={styles.navLink}
                onClick={closeMenu}
              >
                {translation(item.key)}
              </LoaderLink>
            ))}
          </div>

          <div className={styles.navActions}>
            {isAuthed === null ? (
              <div className={styles.actionsPlaceholder} />
            ) : isAuthed ? (
              <LoaderLink
                href="/dashboard"
                className={styles.userPill}
                onClick={closeMenu}
              >
                {translation("dashboard")}
              </LoaderLink>
            ) : (
              <>
                <LoaderLink
                  href="/login"
                  className={styles.loginLink}
                  onClick={closeMenu}
                >
                  {translation("login")}
                </LoaderLink>
                <LoaderLink
                  href="/contact"
                  className={styles.signupBtn}
                  onClick={closeMenu}
                >
                  {translation("book")}
                </LoaderLink>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
