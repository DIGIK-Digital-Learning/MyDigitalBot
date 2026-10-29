"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import usePlatformAdmin from "@/app/hooks/usePlatformAdmin";
import styles from "./navbar.module.css";
import {
  Home,
  Users,
  UsersRound,
  Bot,
  MessageSquare,
  Settings,
  LogOut,
  LogIn,
  ChevronDown,
  SendHorizontal,
  CalendarClock,
  Link2,
  ListChecks,
  Images,
  Zap,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useMobileNav } from "@/app/components/MobileNav/MobileNavContext";

export default function Navbar() {
  const translation = useTranslations();
  const { user, loading: authLoading, supabase, setUser } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);
  const router = useRouter();
  const locale = useLocale();
  const pathName = usePathname();

  const { open, close } = useMobileNav();

  const pathNoLocale = pathName.replace(/^\/(en|pt)(?=\/|$)/, "") || "/";
  const [pendingHref, setPendingHref] = useState(null);
  /*
   * A Administração (#208) só aparece à equipa DIGIK no plano Interno. A
   * experimentar outro plano, o separador desaparece: volta-se pela faixa
   * "Voltar ao Interno". Quem decide o acesso é sempre o servidor.
   */
  const platformAdmin = usePlatformAdmin();
  const isAdmin = platformAdmin.isAdmin && !platformAdmin.trying;

  const isActive = useCallback(
    (href) => {
      const current = pendingHref ?? pathNoLocale;
      if (href === "/") return current === "/";
      return current === href || current.startsWith(href + "/");
    },
    [pendingHref, pathNoLocale],
  );

  const isExactActive = useCallback(
    (href) => {
      const current = pendingHref ?? pathNoLocale;
      return current === href;
    },
    [pendingHref, pathNoLocale],
  );

  const usersSectionActive = isActive("/users");
  const broadcastSectionActive = isActive("/broadcast");
  const [usersOpen, setUsersOpen] = useState(usersSectionActive);
  const [broadcastOpen, setBroadcastOpen] = useState(broadcastSectionActive);

  useEffect(() => setPendingHref(null), [pathName]);
  useEffect(() => close(), [pathName]);

  useEffect(() => {
    if (broadcastSectionActive) {
      setBroadcastOpen(true);
    }

    if (usersSectionActive) {
      setUsersOpen(true);
    }
  }, [broadcastSectionActive, usersSectionActive]);

  const onNavClick = (href) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)
      return;
    setPendingHref(href);
    close();
  };

  async function handleSignOut() {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {}

    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
          localStorage.removeItem(k);
        }
        if (k.startsWith("sb-") && k.endsWith("-refresh-token")) {
          localStorage.removeItem(k);
        }
      }

      try {
        const bc = new BroadcastChannel("supabase.auth");
        bc.postMessage({ event: "SIGNED_OUT" });
        bc.close();
      } catch {}
    } catch {}

    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });

    setUser(null);
    router.replace("/login");
    window.location.assign(`/${locale}/login`);
  }

  return (
    <>
      <aside
        id="primary-nav"
        className={`${styles.sidebar} ${open ? styles.open : ""}`}
        aria-hidden={open ? "false" : "true"}
        aria-label="Main navigation"
      >
        {!authLoading && user ? (
          <>
            <div className={styles.userBlock}>
              <div className={styles.orgLine}>
                {orgLoading ? "…" : (org?.name ?? "—")}
              </div>
              <div className={styles.emailLine}>{user.email}</div>
            </div>

            <nav className={styles.nav}>
              <Link
                href="/dashboard"
                onClick={onNavClick("/dashboard")}
                className={`${styles.navItem} ${
                  isActive("/dashboard") ? styles.active : ""
                }`}
              >
                <Home aria-hidden className={styles.icon} />
                <span>{translation("Nav.home")}</span>
              </Link>

              <div className={styles.group}>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.navToggle} ${
                    usersSectionActive ? styles.active : ""
                  }`}
                  onClick={() => setUsersOpen((prev) => !prev)}
                  aria-expanded={usersOpen}
                  aria-controls="users-subnav"
                >
                  <span className={styles.navItemMain}>
                    <Users aria-hidden className={styles.icon} />
                    <span>{translation("Nav.usersGroup")}</span>
                  </span>

                  <ChevronDown
                    aria-hidden
                    className={`${styles.chevron} ${
                      usersOpen ? styles.chevronOpen : ""
                    }`}
                  />
                </button>

                {usersOpen && (
                  <div id="broadcast-subnav" className={styles.subnav}>
                    <Link
                      href="/users"
                      onClick={onNavClick("/users")}
                      className={`${styles.navItem} ${
                        isActive("/users") ? styles.active : ""
                      }`}
                    >
                      <Users aria-hidden className={styles.icon} />
                      <span>{translation("Nav.users")}</span>
                    </Link>

                    <Link
                      href="/teams-groups"
                      onClick={onNavClick("/teams-groups")}
                      className={`${styles.navItem} ${
                        isActive("/teams-groups") ? styles.active : ""
                      }`}
                    >
                      <UsersRound aria-hidden className={styles.icon} />
                      <span>{translation("Nav.teamsGroups")}</span>
                    </Link>
                  </div>
                )}
              </div>

              <Link
                href="/assistants"
                onClick={onNavClick("/assistants")}
                className={`${styles.navItem} ${
                  isActive("/assistants") ? styles.active : ""
                }`}
              >
                <Bot aria-hidden className={styles.icon} />
                <span>{translation("Nav.assistants")}</span>
              </Link>

              <Link
                href="/automations"
                onClick={onNavClick("/automations")}
                className={`${styles.navItem} ${
                  isActive("/automations") ? styles.active : ""
                }`}
              >
                <Zap aria-hidden className={styles.icon} />
                <span>{translation("Nav.automations")}</span>
              </Link>

              <Link
                href="/analytics"
                onClick={onNavClick("/analytics")}
                className={`${styles.navItem} ${
                  isActive("/analytics") ? styles.active : ""
                }`}
              >
                <BarChart3 aria-hidden className={styles.icon} />
                <span>{translation("Nav.analytics")}</span>
              </Link>

              <div className={styles.group}>
                <button
                  type="button"
                  className={`${styles.navItem} ${styles.navToggle} ${
                    broadcastSectionActive ? styles.active : ""
                  }`}
                  onClick={() => setBroadcastOpen((prev) => !prev)}
                  aria-expanded={broadcastOpen}
                  aria-controls="broadcast-subnav"
                >
                  <span className={styles.navItemMain}>
                    <MessageSquare aria-hidden className={styles.icon} />
                    <span>{translation("Nav.broadcast")}</span>
                  </span>

                  <ChevronDown
                    aria-hidden
                    className={`${styles.chevron} ${
                      broadcastOpen ? styles.chevronOpen : ""
                    }`}
                  />
                </button>

                {broadcastOpen && (
                  <div id="broadcast-subnav" className={styles.subnav}>
                    <Link
                      href="/broadcast"
                      onClick={onNavClick("/broadcast")}
                      className={`${styles.subnavItem} ${
                        isExactActive("/broadcast") ? styles.active : ""
                      }`}
                    >
                      <SendHorizontal
                        aria-hidden
                        className={styles.subnavIcon}
                      />
                      <span>{translation("Nav.broadcastCreate")}</span>
                    </Link>

                    <Link
                      href="/broadcast/scheduled"
                      onClick={onNavClick("/broadcast/scheduled")}
                      className={`${styles.subnavItem} ${
                        isActive("/broadcast/scheduled") ? styles.active : ""
                      }`}
                    >
                      <CalendarClock
                        aria-hidden
                        className={styles.subnavIcon}
                      />
                      <span>{translation("Nav.broadcastScheduled")}</span>
                    </Link>

                    <Link
                      href="/broadcast/tracked-links"
                      onClick={onNavClick("/broadcast/tracked-links")}
                      className={`${styles.subnavItem} ${
                        isActive("/broadcast/tracked-links")
                          ? styles.active
                          : ""
                      }`}
                    >
                      <Link2 aria-hidden className={styles.subnavIcon} />
                      <span>{translation("Nav.trackedLinks")}</span>
                    </Link>

                    <Link
                      href="/broadcast/questions"
                      onClick={onNavClick("/broadcast/questions")}
                      className={`${styles.subnavItem} ${
                        isActive("/broadcast/questions") ? styles.active : ""
                      }`}
                    >
                      <ListChecks aria-hidden className={styles.subnavIcon} />
                      <span>{translation("Nav.questions")}</span>
                    </Link>

                    <Link
                      href="/broadcast/media"
                      onClick={onNavClick("/broadcast/media")}
                      className={`${styles.subnavItem} ${
                        isActive("/broadcast/media") ? styles.active : ""
                      }`}
                    >
                      <Images aria-hidden className={styles.subnavIcon} />
                      <span>{translation("Nav.media")}</span>
                    </Link>
                  </div>
                )}
              </div>
            </nav>

            {isAdmin && (
              <Link
                href="/platform-admin"
                onClick={onNavClick("/platform-admin")}
                className={`${styles.navItem} ${styles.options} ${
                  isActive("/platform-admin") ? styles.active : ""
                }`}
              >
                <ShieldCheck aria-hidden className={styles.icon} />
                <span>{translation("Nav.admin")}</span>
              </Link>
            )}

            <Link
              href="/settings"
              onClick={onNavClick("/settings")}
              className={`${styles.navItem} ${styles.options} ${
                isAdmin ? styles.afterAdmin : ""
              } ${isActive("/settings") ? styles.active : ""}`}
            >
              <Settings aria-hidden className={styles.icon} />
              <span>{translation("Nav.options")}</span>
            </Link>

            <button
              onClick={handleSignOut}
              className={`${styles.navItem} ${styles.signOut}`}
            >
              <LogOut aria-hidden className={styles.icon} />
              <span>{translation("Nav.logout")}</span>
            </button>
          </>
        ) : (
          <nav className={styles.nav}>
            <Link
              className={styles.navItem}
              href="/login"
              onClick={() => close()}
            >
              <LogIn aria-hidden className={styles.icon} />
              <span>{translation("Nav.login")}</span>
            </Link>
          </nav>
        )}
      </aside>

      <button
        className={styles.backdrop}
        hidden={!open}
        aria-hidden="true"
        tabIndex={-1}
        onClick={close}
      />
    </>
  );
}
