import { withSessionReadAccess, getSessionReadClient } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";

import {
  handleApiError,
  requireOwnedOrg,
} from "@/lib/auth/guards";



export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgId = Number(searchParams.get("orgId"));
    const limit = Math.min(
      500,
      Math.max(1, Number(searchParams.get("limit") || 100)),
    );

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const { data, error } = await getSessionReadClient(orgAuth)
        .from("automation_run")
        .select(
          `
          *,
          user_row:user_id (
            id,
            name
          )
        `,
        )
        .eq("organization_id", orgAuth.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      return NextResponse.json({ items: data || [] });
    });
  } catch (error) {
    return handleApiError(error, "Failed to load automation runs");
  }
}