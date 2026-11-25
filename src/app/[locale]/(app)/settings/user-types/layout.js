import PermissionGate from "@/app/components/PermissionGate/PermissionGate";
import { PERMISSIONS } from "@/lib/auth/permissions";

/* Sem permissão para gerir os tipos, a página mostra um aviso (#247). */
export default function Layout({ children }) {
  return (
    <PermissionGate permission={PERMISSIONS.TEAM_USER_TYPES}>
      {children}
    </PermissionGate>
  );
}