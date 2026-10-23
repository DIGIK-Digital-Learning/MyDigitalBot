// src/app/components/TopBar/TopBar.jsx
"use client";

import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { getOrganizationLogoUrl } from "@/lib/helpers/organizationLogo.helpers";
import styles from "./topbar.module.css";
import LanguageSwitch from "./LanguageSwitch";
import { Menu, X } from "lucide-react";
import { useMobileNav } from "../MobileNav/MobileNavContext";
import { saveOrganizationLocale } from "@/lib/organizations/organizations.api";

export default function TopBar() {
  const { user } = useAuth();
  const { org } = useOrganization(user);

  const { open, toggle } = useMobileNav();

  const logoUrl = getOrganizationLogoUrl(org?.logo_url);

  return (
    <header className={styles.topbar} role="banner">
      <div className={styles.inner}>
        <button
          className={styles.hamburger}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-controls="primary-nav"
          aria-expanded={open ? "true" : "false"}
          onClick={toggle}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
        <div className={styles.brand}>
          <img className={styles.logo} src={logoUrl} alt="" />
        </div>

        {/* RIGHT SIDE (pushes to the far right) */}
        <div className={styles.right}>
          {/* put other right-side controls here later if you want */}
          <LanguageSwitch
            onChoose={(locale) => {
              if (org?.id) saveOrganizationLocale(org.id, locale);
            }}
          />
        </div>
      </div>
    </header>
  );
}
