import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import {
  getOrganizationOpeningBody,
  updateOrganizationOpeningBody,
} from "@/lib/repos/organizations.repo";
import {
  DEFAULT_OPENING_BODY,
  OPENING_BODY_MAX_LENGTH,
  OPENING_TEMPLATE_BUTTON,
  OPENING_TEMPLATE_INTRO,
  OPENING_TEMPLATE_OUTRO,
  resolveOpeningBody,
  sanitizeOpeningBody,
} from "@/lib/whatsapp/openingTemplate";
import {
  handleApiError,
  parsePositiveInt,
  requireOwnedOrg,
} from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildResponse(storedBody) {
  return {
    body: resolveOpeningBody(storedBody),
    isDefault: !sanitizeOpeningBody(storedBody),
    defaultBody: DEFAULT_OPENING_BODY,
    intro: OPENING_TEMPLATE_INTRO,
    outro: OPENING_TEMPLATE_OUTRO,
    button: OPENING_TEMPLATE_BUTTON,
    maxLength: OPENING_BODY_MAX_LENGTH,
  };
}

export async function GET(req) {
  try {
    const rawOrgId = req.nextUrl.searchParams.get("orgId");
    const orgId = parsePositiveInt(rawOrgId);

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const stored = await getOrganizationOpeningBody(orgAuth.orgId);

      return NextResponse.json({ item: buildResponse(stored) });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load opening message");
  }
}

export async function PUT(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const orgId = parsePositiveInt(body?.orgId);

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    if (typeof body?.body !== "string") {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const clean = sanitizeOpeningBody(body.body);

    if (!clean) {
      return NextResponse.json(
        { error: "The opening message body cannot be empty" },
        { status: 400 },
      );
    }

    if (clean.length > OPENING_BODY_MAX_LENGTH) {
      return NextResponse.json(
        {
          error: `The opening message body must have at most ${OPENING_BODY_MAX_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    const stored = await updateOrganizationOpeningBody(orgAuth.orgId, clean);

    return NextResponse.json({ ok: true, item: buildResponse(stored) });
  } catch (err) {
    return handleApiError(err, "Failed to save opening message");
  }
}
