import { NextResponse } from "next/server";

import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { ANY_MEMBER, VIEW_AS_TYPES } from "@/lib/auth/permissions";

/*
 * O que quem tem a sessão pode fazer nesta organização (#247), para o ecrã
 * pôr a cinzento o que não pode usar. Já com o «Ver como» aplicado. Quem
 * decide continua a ser o servidor, em cada rota.
 *
 * `{ typeKey, isAdmin, permissions, viewAs, canSwitch, viewAsTypes }`
 */
export async function GET(request) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");

    const orgAuth = await requireOwnedOrg(orgId, { permission: ANY_MEMBER });
    if (orgAuth.error) return orgAuth.error;

    const { access, realAccess } = orgAuth;
    const canSwitch = Boolean(realAccess?.isAdmin);

    return NextResponse.json({
      typeKey: access.typeKey,
      isAdmin: access.isAdmin,
      permissions: access.permissions,
      viewAs: canSwitch ? access.viewingAs ?? null : null,
      canSwitch,
      viewAsTypes: canSwitch ? VIEW_AS_TYPES : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load access");
  }
}
