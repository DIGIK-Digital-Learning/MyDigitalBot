import { NextResponse } from "next/server";

import {
  handleApiError,
  jsonError,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import {
  ADMIN_ONLY,
  ANY_MEMBER,
  VIEW_AS_COOKIE,
  VIEW_AS_TYPES,
} from "@/lib/auth/permissions";

/*
 * «Ver como» (#247), como o «Experimentar como» dos planos: um
 * Administrador vê a app com as permissões do Editor ou do Leitor, para
 * confirmar o que eles veem. Fica num cookie desta sessão (8 horas) e não
 * muda nada na base de dados. Só tira permissões.
 */
const EIGHT_HOURS = 8 * 60 * 60;

/* `{ canSwitch, viewAs, types }`: se pode trocar, como está a ver e para quê. */
export async function GET(request) {
  try {
    const orgId = request.nextUrl.searchParams.get("orgId");

    const orgAuth = await requireOwnedOrg(orgId, { permission: ANY_MEMBER });
    if (orgAuth.error) return orgAuth.error;

    const canSwitch = Boolean(orgAuth.realAccess?.isAdmin);

    return NextResponse.json({
      canSwitch,
      viewAs: canSwitch ? orgAuth.access?.viewingAs ?? null : null,
      types: canSwitch ? VIEW_AS_TYPES : [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to load view-as");
  }
}

/* `{ orgId, typeKey }`: typeKey "editor" ou "viewer"; null volta ao normal. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    /* Decide o tipo verdadeiro: quem está a ver como Leitor pode voltar. */
    const orgAuth = await requireOwnedOrg(body?.orgId, {
      permission: ADMIN_ONLY,
      realAccess: true,
    });
    if (orgAuth.error) return orgAuth.error;

    const typeKey = body?.typeKey ?? null;

    if (typeKey !== null && !VIEW_AS_TYPES.includes(typeKey)) {
      return jsonError("Invalid user type", 400);
    }

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
