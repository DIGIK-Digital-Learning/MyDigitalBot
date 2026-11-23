"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import LoaderLink from "@/app/[locale]/(marketing)/components/TopLoader/LoaderLink";
import styles from "./navbar.module.css";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import createClient from "@/utils/supabase/client";
import LanguageMenu from "./LanguageMenu";
import ElasticBrandLogo from "./ElasticBrandLogo";
import usePageDemoCtaVisibility from "./usePageDemoCtaVisibility";
import { usePathname } from "@/i18n/navigation";

// `usePathname` from `@/i18n/navigation` already strips the locale prefix
// (e.g. both `/product` and `/en/product` resolve to `/product`), so it can
// be compared directly against these locale-agnostic hrefs.
function isNavItemActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

export default function MarketingNavbar({ trailing = null }) {
  // `trailing` is kept as an escape hatch for extra header content, but the
  // language switcher itself is now always rendered here (see LanguageMenu)
  // so every marketing page gets it for free and consistently.
  const translation = useTranslations("LandingPage.Hero.Nav");
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(null);
  const supabase = useMemo(() => createClient(), []);
  const headerRef = useRef(null);
  const showDemoCta = usePageDemoCtaVisibility(headerRef);
  const pathname = usePathname();
  // Na própria página de contacto o botão de demo não leva a lado nenhum.
  const onContactPage = isNavItemActive(pathname, "/contact");

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
    <header className={styles.navWrap} ref={headerRef}>
      <nav className={styles.navbar}>
        <div className={styles.topBar}>
          <LoaderLink href="/" className={styles.brand} onClick={closeMenu}>
            <ElasticBrandLogo />
            {/* <span className={styles.brandText}>MyDigitalBot</span> */}
          </LoaderLink>

          {/* Telemóvel: o pedido de demonstração fica sempre à vista na barra;
              a escolha de língua passa para dentro do menu. */}
          <div className={styles.mobileTrailing}>
            {isAuthed || onContactPage ? null : (
              <LoaderLink
                href="/contact"
                className={styles.mobileCta}
                onClick={closeMenu}
              >
                {translation("bookShort")}
              </LoaderLink>
            )}
            {trailing}
          </div>

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
            {NAV.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <LoaderLink
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${
                    isActive ? styles.navLinkActive : ""
                  }`}
                  onClick={closeMenu}
                  aria-current={isActive ? "page" : undefined}
                >
                  {translation(item.key)}
                </LoaderLink>
              );
            })}
          </div>

          <div className={styles.navActions}>
            {isAuthed === null ? (
              <div className={styles.actionsPlaceholder} />
            ) : isAuthed ? (
              <LoaderLink
                href="/users"
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
                  className={`${styles.signupBtn} ${
                    showDemoCta && !onContactPage ? "" : styles.signupBtnHidden
                  }`}
                  onClick={closeMenu}
                  aria-hidden={!showDemoCta || onContactPage}
                  tabIndex={showDemoCta && !onContactPage ? undefined : -1}
                >
                  {translation("book")}
                </LoaderLink>
              </>
            )}
            <LanguageMenu />
            {trailing}
          </div>
        </div>
      </nav>
    </header>
  );
}
