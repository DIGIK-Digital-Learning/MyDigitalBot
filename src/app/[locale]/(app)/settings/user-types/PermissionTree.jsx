"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bot,
  CalendarClock,
  Contact,
  Home,
  Images,
  Link2,
  ListChecks,
  SendHorizontal,
  Settings,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";

import { PERMISSION_TREE } from "@/lib/auth/permissions";

import styles from "./userTypes.module.css";

/*
 * A árvore de caixas dos tipos de utilizador (#247, parte 4/4), como a da
 * TalentLMS. Marcar uma área marca tudo o que está por baixo; marcar uma
 * ação marca o «Ver» da área; tirar o «Ver» tira as ações. As permissões
 * que quem edita não tem ficam a cinzento (ninguém dá o que não tem).
 */

/* Os mesmos ícones do menu da barra lateral, para cada área se reconhecer. */
const AREA_ICONS = {
  dashboard: Home,
  users: Users,
  teamsGroups: UsersRound,
  assistants: Bot,
  send: SendHorizontal,
  scheduled: CalendarClock,
  links: Link2,
  questions: ListChecks,
  media: Images,
  automations: Zap,
  analytics: BarChart3,
  settings: Settings,
  team: Contact,
};

/* As chaves dos textos: «users.view» → «users_view». */
export const permissionTextKey = (permission) => permission.replace(/\./g, "_");

function areaPermissions(area) {
  return area.view ? [area.view, ...area.actions] : [...area.actions];
}

/* Aplica as regras de dependência a uma mudança numa caixa. */
export function togglePermission(selected, permission, checked) {
  const next = new Set(selected);
  const area = PERMISSION_TREE.find((item) => areaPermissions(item).includes(permission));

  if (checked) {
    next.add(permission);
    if (area?.view && permission !== area.view) next.add(area.view);
  } else {
    next.delete(permission);
    if (area?.view === permission) area.actions.forEach((action) => next.delete(action));
  }
  return next;
}

function AreaCheckbox({ checked, indeterminate, ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} {...props} />;
}

export default function PermissionTree({ selected, onChange, allowed, readOnly = false }) {
  const t = useTranslations("UserTypes");

  const canUse = (permission) => !readOnly && allowed.has(permission);

  function toggleArea(area, checked) {
    let next = new Set(selected);
    for (const permission of areaPermissions(area)) {
      if (!canUse(permission)) continue;
      if (checked) next.add(permission);
      else next.delete(permission);
    }
    /* Uma ação que fique sem «Ver» volta a puxá-lo. */
    if (area.view && area.actions.some((action) => next.has(action))) next.add(area.view);
    onChange(next);
  }

  return (
    <div className={styles.tree}>
      {PERMISSION_TREE.map((area) => {
        const permissions = areaPermissions(area);
        const count = permissions.filter((permission) => selected.has(permission)).length;
        const areaUsable = permissions.some(canUse);
        const Icon = AREA_ICONS[area.area];
        const state = count === 0 ? "none" : count === permissions.length ? "all" : "some";

        return (
          <section key={area.area} className={styles.area} data-state={state}>
            <header className={styles.areaHeader}>
              <label className={styles.areaTitle}>
                <AreaCheckbox
                  checked={count === permissions.length}
                  indeterminate={count > 0 && count < permissions.length}
                  disabled={!areaUsable}
                  onChange={(event) => toggleArea(area, event.target.checked)}
                />
                {Icon ? <Icon size={16} aria-hidden className={styles.areaIcon} /> : null}
                <span>{t(`areas.${area.area}`)}</span>
              </label>
              <span className={styles.areaCount}>
                {count}/{permissions.length}
              </span>
            </header>
            <ul className={styles.permissionList}>
              {permissions.map((permission) => {
                const usable = canUse(permission);
                return (
                  <li key={permission}>
                    <label
                      className={[
                        styles.permission,
                        selected.has(permission) ? styles.permissionOn : "",
                        usable ? "" : styles.permissionLocked,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={!readOnly && !usable ? t("editor.notYours") : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(permission)}
                        disabled={!usable}
                        onChange={(event) =>
                          onChange(togglePermission(selected, permission, event.target.checked))
                        }
                      />
                      <span>{t(`permissions.${permissionTextKey(permission)}`)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
