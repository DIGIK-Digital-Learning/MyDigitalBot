import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { CUSTOM_USER_TYPE_LIMIT, PERMISSIONS } from "@/lib/auth/permissions";
import { TeamError } from "@/lib/services/team/team.service";
import {
  createUserType,
  deleteUserType,
  listUserTypes,
  updateUserType,
} from "@/lib/services/team/userTypes.service";

/*
 * Definições → Tipos de utilizador (#247, parte 4/4). Tudo pede
 * team.user_types. Quem pede só cria ou edita tipos com permissões que ele
 * próprio tem; o serviço confirma.
 */

function errorResponse(error, fallback) {
  if (error instanceof TeamError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  return handleApiError(error, fallback);
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function authorize(orgId) {
  return requireOwnedOrg(orgId, { permission: PERMISSIONS.TEAM_USER_TYPES });
}

export async function GET(req) {
  try {
    const orgAuth = await authorize(new URL(req.url).searchParams.get("orgId"));
    if (orgAuth.error) return orgAuth.error;

    const types = await listUserTypes(orgAuth);
    return NextResponse.json({
      types,
      limit: CUSTOM_USER_TYPE_LIMIT,
      used: types.filter((type) => !type.isSystem).length,
      /* As permissões de quem pede: as outras ficam a cinzento na árvore. */
      myPermissions: orgAuth.access.permissions,
    });
  } catch (error) {
    return errorResponse(error, "Failed to load user types");
  }
}

export async function POST(req) {
  try {
    const body = await readJson(req);
    const orgAuth = await authorize(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    const type = await createUserType(orgAuth, {
      name: body?.name,
      permissions: body?.permissions,
    });
    return NextResponse.json(type, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to create user type");
  }
}

export async function PATCH(req) {
  try {
    const body = await readJson(req);
    const typeId = parsePositiveInt(body?.typeId);
    if (!typeId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const orgAuth = await authorize(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    const result = await updateUserType(orgAuth, {
      typeId,
      name: body?.name,
      permissions: body?.permissions,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to update user type");
  }
}

export async function DELETE(req) {
  try {
    const params = new URL(req.url).searchParams;
    const typeId = parsePositiveInt(params.get("typeId"));
    if (!typeId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const orgAuth = await authorize(params.get("orgId"));
    if (orgAuth.error) return orgAuth.error;

    const result = await deleteUserType(orgAuth, { typeId });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to delete user type");
  }
}
