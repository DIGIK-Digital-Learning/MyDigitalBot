// src/app/components/TopBar/TopBar.jsx
"use client";

import { useAuth } from "@/app/AuthContext";
import useOrganization from "@/app/hooks/useOrganization";
import { getOrganizationLogoUrl } from "@/lib/helpers/organizationLogo.helpers";
import styles from "./topbar.module.css";
import LanguageSwitch from "./LanguageSwitch";
import { ViewAsSwitch } from "../ViewAs/ViewAs";
import { Menu, X } from "lucide-react";
import { useMobileNav } from "../MobileNav/MobileNavContext";
import { saveOrganizationLocale } from "@/lib/organizations/organizations.api";
import usePermissions from "@/app/PermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default function TopBar() {
  const { can } = usePermissions();
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
          <ViewAsSwitch />
          <LanguageSwitch
            onChoose={(locale) => {
              /* Só quem mexe nas definições guarda o idioma da organização (#247). */
              if (org?.id && can(PERMISSIONS.SETTINGS_ORGANIZATION)) {
                saveOrganizationLocale(org.id, locale);
              }
            }}
          />
        </div>
      </div>
    </header>
  );
}
