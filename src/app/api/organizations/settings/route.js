import { withSessionReadAccess } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import { PERMISSIONS, accessAllows } from "@/lib/auth/permissions";

const INTEGRATION_FIELDS = ["teams_tenant_id", "waba_id", "waba_namespace"];
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

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.SETTINGS_ORGANIZATION });
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

    const orgAuth = await requireOwnedOrg(orgId, { permission: PERMISSIONS.SETTINGS_ORGANIZATION });
    if (orgAuth.error) return orgAuth.error;

    /*
     * Os ids do WhatsApp e do Teams são integrações (#247): mudá-los pede
     * também essa permissão, além da de editar a organização.
     */
    const touchesIntegrations = INTEGRATION_FIELDS.some((field) =>
      Object.hasOwn(body || {}, field),
    );

    if (
      touchesIntegrations &&
      !accessAllows(orgAuth.access, PERMISSIONS.SETTINGS_INTEGRATIONS)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const item = await saveOrganizationSettings(orgAuth.orgId, body);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Failed to update organization settings");
  }
}
