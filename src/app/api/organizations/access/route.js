import { NextResponse } from "next/server";

import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { ANY_MEMBER, VIEW_AS_TYPES } from "@/lib/auth/permissions";
import { listUserTypes } from "@/lib/repos/userTypes.repo";

/*
 * Os tipos do «Ver como»: o Editor, o Leitor e os personalizados da
 * organização. `value` é o que se guarda no cookie.
 */
async function viewAsOptions(orgId) {
  const system = VIEW_AS_TYPES.map((key) => ({ value: key, key, name: null }));

  try {
    const custom = (await listUserTypes(orgId))
      .filter((type) => !type.isSystem)
      .map((type) => ({ value: String(type.id), key: null, name: type.name }));
    return [...system, ...custom];
  } catch (error) {
    /* Sem os personalizados, o seletor continua a servir para os outros. */
    console.error("[Access] user types lookup failed", error);
    return system;
  }
}

/*
 * O que quem tem a sessão pode fazer nesta organização (#247), para o ecrã
 * pôr a cinzento o que não pode usar. Já com o «Ver como» aplicado. Quem
 * decide continua a ser o servidor, em cada rota.
 *
 * `{ typeKey, isAdmin, permissions, viewAs, viewAsName, canSwitch,
 *   viewAsTypes: [{ value, key, name }] }`
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
      viewAsName: canSwitch ? access.viewingAsName ?? null : null,
      canSwitch,
      viewAsTypes: canSwitch ? await viewAsOptions(orgAuth.orgId) : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load access");
  }
}
