"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import usePermissions from "@/app/PermissionsContext";

import styles from "./PermissionGate.module.css";

/*
 * Página que pede uma permissão de «Ver» (#247). Sem ela, a página abre na
 * mesma (o menu é igual para todos), mas no lugar dos dados aparece um
 * aviso. `permission` é uma permissão do catálogo ou uma lista (basta uma).
 */
export default function PermissionGate({ permission, children }) {
  const translation = useTranslations("Permissions");
  const { can } = usePermissions();

  if (can(permission)) return children;

  return (
    <div className={styles.notice} role="status" data-testid="permission-gate">
      <Lock size={28} aria-hidden="true" />
      <h2>{translation("noPage.title")}</h2>
      <p>{translation("noPage.description")}</p>
    </div>
  );
}
