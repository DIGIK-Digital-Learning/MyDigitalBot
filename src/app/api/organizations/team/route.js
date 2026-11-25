import { NextResponse } from "next/server";

import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  TeamError,
  changeTeamMemberType,
  getTeamLimits,
  inviteTeamMember,
  listTeam,
  removeTeamMember,
  resendTeamInvite,
} from "@/lib/services/team/team.service";
import { listUserTypes } from "@/lib/services/team/userTypes.service";

/*
 * Definições → Equipa (#247, parte 3/4): as contas que entram na app.
 * Ver pede team.view; convidar, mudar o tipo e remover pedem team.manage.
 */

function teamErrorResponse(error) {
  if (error instanceof TeamError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  return null;
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* Para onde o link do email leva: escolher a palavra-passe e entrar. */
function inviteRedirect(req, locale) {
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const safeLocale = locale === "en" ? "en" : "pt";
  const url = new URL(`/${safeLocale}/reset/confirm`, origin);
  url.searchParams.set("invite", "1");
  url.searchParams.set("next", `/${safeLocale}/dashboard`);
  return url.toString();
}

export async function GET(req) {
  try {
    const orgId = parsePositiveInt(new URL(req.url).searchParams.get("orgId"));
    if (!orgId) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.TEAM_VIEW });
    if (orgAuth.error) return orgAuth.error;

    const [members, { limits, usage }, types] = await Promise.all([
      listTeam(orgAuth),
      getTeamLimits(orgAuth.orgId),
      listUserTypes(orgAuth),
    ]);

    /* Os predefinidos e os personalizados; canAssign: quem pede pode dá-lo (#247, 4/4). */
    return NextResponse.json({
      members,
      limits,
      usage,
      types: types.map(({ id, key, name, isSystem, canAssign }) => ({
        id,
        key,
        name,
        isSystem,
        canAssign,
      })),
    });
  } catch (error) {
    return handleApiError(error, "Failed to load team");
  }
}

export async function POST(req) {
  try {
    const body = await readJson(req);
    const orgId = parsePositiveInt(body?.orgId);
    if (!orgId) {
      return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.TEAM_MANAGE });
    if (orgAuth.error) return orgAuth.error;

    /* Reenviar o convite a quem ainda não entrou (o link expira). */
    if (body?.action === "resend") {
      const memberId = parsePositiveInt(body?.memberId);
      if (!memberId) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const resent = await resendTeamInvite(orgAuth, {
        memberId,
        redirectTo: inviteRedirect(req, body?.locale),
      });
      return NextResponse.json(resent);
    }

    const result = await inviteTeamMember(orgAuth, {
      email: body?.email,
      typeId: parsePositiveInt(body?.typeId),
      redirectTo: inviteRedirect(req, body?.locale),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return teamErrorResponse(error) ?? handleApiError(error, "Failed to invite");
  }
}

export async function PATCH(req) {
  try {
    const body = await readJson(req);
    const orgId = parsePositiveInt(body?.orgId);
    const memberId = parsePositiveInt(body?.memberId);
    if (!orgId || !memberId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.TEAM_MANAGE });
    if (orgAuth.error) return orgAuth.error;

    const result = await changeTeamMemberType(orgAuth, {
      memberId,
      typeId: parsePositiveInt(body?.typeId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return teamErrorResponse(error) ?? handleApiError(error, "Failed to update member");
  }
}

export async function DELETE(req) {
  try {
    const params = new URL(req.url).searchParams;
    const orgId = parsePositiveInt(params.get("orgId"));
    const memberId = parsePositiveInt(params.get("memberId"));
    if (!orgId || !memberId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.TEAM_MANAGE });
    if (orgAuth.error) return orgAuth.error;

    const result = await removeTeamMember(orgAuth, { memberId });
    return NextResponse.json(result);
  } catch (error) {
    return teamErrorResponse(error) ?? handleApiError(error, "Failed to remove member");
  }
}
