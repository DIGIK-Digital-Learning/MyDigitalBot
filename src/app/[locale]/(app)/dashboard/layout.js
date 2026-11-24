import PermissionGate from "@/app/components/PermissionGate/PermissionGate";
import { PERMISSIONS } from "@/lib/auth/permissions";

/* Sem permissão de «Ver», a página mostra um aviso no lugar dos dados (#247). */
export default function Layout({ children }) {
  return (
    <PermissionGate permission={PERMISSIONS.DASHBOARD_VIEW}>
      {children}
    </PermissionGate>
  );
}
