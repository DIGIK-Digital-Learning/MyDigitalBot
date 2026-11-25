import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getOrgScheduledBroadcasts } from "@/lib/repos/scheduledBroadcasts.repo";
import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SOURCES = new Set([
  "all",
  "manual",
  "automation",
]);

function parseSource(value) {
  if (value == null || value === "") {
    return "all";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ALLOWED_SOURCES.has(normalized)
    ? normalized
    : null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const rawOrgId = searchParams.get("orgId");
    const source = parseSource(
      searchParams.get("source"),
    );

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json(
        { error: "Missing orgId" },
        { status: 400 },
      );
    }

    if (!source) {
      return NextResponse.json(
        { error: "Invalid source" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(rawOrgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const data = await getOrgScheduledBroadcasts(
        orgAuth.orgId,
        { source },
      );

      return NextResponse.json({
        items: data,
      });
    });
  } catch (err) {
    return handleApiError(
      err,
      "Failed to load scheduled broadcasts",
    );
  }
}