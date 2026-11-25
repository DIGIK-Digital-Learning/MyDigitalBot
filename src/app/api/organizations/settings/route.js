import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import {
  loadOrganizationSettings,
  saveOrganizationSettings,
} from "@/lib/services/organizationSettings.service";

export async function GET(request) {
  try {
    const rawOrgId = request.nextUrl.searchParams.get("orgId");
    if (!rawOrgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgId = parsePositiveInt(rawOrgId);
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const item = await loadOrganizationSettings(orgAuth.orgId);
      return NextResponse.json({ ok: true, item });
    });
  } catch (error) {
    return handleApiError(error, "Failed to load organization settings");
  }
}

export async function PATCH(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const rawOrgId = body?.orgId ?? body?.organizationId;
    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgId = parsePositiveInt(rawOrgId);
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const item = await saveOrganizationSettings(orgAuth.orgId, body);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Failed to update organization settings");
  }
}
