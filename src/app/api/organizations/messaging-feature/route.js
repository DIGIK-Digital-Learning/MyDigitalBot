import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import {
  getOrganizationMessagingFeature,
  setReadChainsEnabled,
} from "@/lib/repos/organizationMessagingFeature.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";

const ALLOWED_CHANNELS = new Set(["whatsapp"]);

function parseChannel(value) {
  if (value == null || value === "") {
    return "whatsapp";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!ALLOWED_CHANNELS.has(normalized)) {
    return null;
  }

  return normalized;
}

function getOrgIdFromUrl(req) {
  return parsePositiveInt(
    req.nextUrl.searchParams.get("orgId"),
  );
}

function getChannelFromUrl(req) {
  return parseChannel(
    req.nextUrl.searchParams.get("channel"),
  );
}

export async function GET(req) {
  try {
    const rawOrgId =
      req.nextUrl.searchParams.get("orgId");

    const orgId = getOrgIdFromUrl(req);
    const channel = getChannelFromUrl(req);

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json(
        { error: "Missing orgId" },
        { status: 400 },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    if (!channel) {
      return NextResponse.json(
        { error: "Invalid channel" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const feature =
        await getOrganizationMessagingFeature({
          organizationId: orgAuth.orgId,
          channel,
        });

      return NextResponse.json({
        ok: true,
        item: feature ?? {
          organization_id: orgAuth.orgId,
          channel,
          read_chains_enabled: false,
        },
      });
    });
  } catch (error) {
    return handleApiError(
      error,
      "Failed to load messaging feature.",
    );
  }
}

export async function PATCH(req) {
  try {
    let body;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const rawOrgId =
      body?.organizationId ?? body?.orgId;

    const orgId = parsePositiveInt(rawOrgId);
    const channel = parseChannel(body?.channel);

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json(
        { error: "Missing orgId" },
        { status: 400 },
      );
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Invalid organization id" },
        { status: 400 },
      );
    }

    if (!channel) {
      return NextResponse.json(
        { error: "Invalid channel" },
        { status: 400 },
      );
    }

    if (
      typeof body.readChainsEnabled !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "readChainsEnabled must be a boolean",
        },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const feature = await setReadChainsEnabled({
      organizationId: orgAuth.orgId,
      channel,
      enabled: body.readChainsEnabled,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.ORGANIZATION_SETTINGS_UPDATED,
      entityId: orgAuth.orgId,
      details: {
        setting: "read_chains_enabled",
        channel,
        enabled: body.readChainsEnabled,
      },
    });

    return NextResponse.json({
      ok: true,
      item: feature,
    });
  } catch (error) {
    return handleApiError(
      error,
      "Failed to update messaging feature.",
    );
  }
}
