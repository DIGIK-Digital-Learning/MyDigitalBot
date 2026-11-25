export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { handleApiError, parsePositiveInt, requireOwnedOrg } from "@/lib/auth/guards";
import { loadOrganizationFavicon, saveOrganizationFavicon, resetOrganizationFavicon } from "@/lib/services/organizationFavicon.service";

// Logo paths carry a UUID, so a rendered favicon never changes for a given path.
const CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function GET(request) {
  try {
    const path = new URL(request.url).searchParams.get("path");
    const png = await loadOrganizationFavicon(path);

    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    if (error?.status === 400 || error?.status === 404) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return handleApiError(error, "Failed to render organization favicon");
  }
}

export async function POST(request) {
  try {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Dados de upload inválidos" },
        { status: 400 },
      );
    }

    const orgId = parsePositiveInt(formData.get("orgId"));
    if (!orgId) {
      return NextResponse.json(
        { error: "Organização inválida" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const item = await saveOrganizationFavicon(orgAuth.orgId, formData.get("favicon"));
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Não foi possível carregar o favicon");
  }
}

export async function DELETE(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corpo JSON inválido" },
        { status: 400 },
      );
    }

    const orgId = parsePositiveInt(body?.orgId ?? body?.organizationId);
    if (!orgId) {
      return NextResponse.json(
        { error: "Organização inválida" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const item = await resetOrganizationFavicon(orgAuth.orgId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Não foi possível remover o favicon");
  }
}
