import { NextResponse } from "next/server";

import {
  handleApiError,
  jsonError,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import {
  ADMIN_ONLY,
  VIEW_AS_COOKIE,
  parseViewAs,
} from "@/lib/auth/permissions";
import { getUserType } from "@/lib/repos/userTypes.repo";

/*
 * «Ver como» (#247), como o «Experimentar como» dos planos: um
 * Administrador vê a app com as permissões do Editor, do Leitor ou de um
 * tipo personalizado da organização, para confirmar o que essas pessoas
 * veem. Fica num cookie desta sessão (8 horas) e não
 * muda nada na base de dados. Só tira permissões. O estado lê-se em
 * /api/organizations/access.
 */
const EIGHT_HOURS = 8 * 60 * 60;

/*
 * `{ orgId, typeKey }`: "editor", "viewer" ou o id de um tipo personalizado
 * desta organização; null volta ao normal.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    /* Decide o tipo verdadeiro: quem está a ver como Leitor pode voltar. */
    const orgAuth = await requireOwnedOrg(body?.orgId, {
      permission: ADMIN_ONLY,
      realAccess: true,
    });
    if (orgAuth.error) return orgAuth.error;

    const raw = body?.typeKey ?? null;
    const choice = raw === null || raw === "" ? null : parseViewAs(raw);

    if (raw !== null && raw !== "" && !choice) {
      return jsonError("Invalid user type", 400);
    }

    if (choice?.id) {
      const type = await getUserType(orgAuth.orgId, choice.id);
      if (!type || type.isSystem) return jsonError("Invalid user type", 400);
    }

    const typeKey = choice ? String(choice.key ?? choice.id) : null;
    const response = NextResponse.json({ ok: true, viewAs: typeKey });

    if (typeKey) {
      response.cookies.set(VIEW_AS_COOKIE, typeKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: EIGHT_HOURS,
      });
    } else {
      response.cookies.delete(VIEW_AS_COOKIE);
    }

    return response;
  } catch (error) {
    return handleApiError(error, "Failed to change view-as");
  }
}
