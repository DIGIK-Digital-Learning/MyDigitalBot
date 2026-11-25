export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";
import {
  resetOrganizationLogo,
  saveOrganizationLogo,
} from "@/lib/services/organizationLogo.service";

export async function POST(request) {
  try {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form data" },
        { status: 400 },
      );
    }

    const orgId = parsePositiveInt(formData.get("orgId"));
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const item = await saveOrganizationLogo(orgAuth.orgId, formData.get("logo"));
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Failed to upload organization logo");
  }
}

export async function DELETE(request) {
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

    const orgId = parsePositiveInt(body?.orgId ?? body?.organizationId);
    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const item = await resetOrganizationLogo(orgAuth.orgId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error, "Failed to reset organization logo");
  }
}
