import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getThreadsForUser } from "@/lib/repos/threads.repo";
import { handleApiError, requireOrgForUser } from "@/lib/auth/guards";
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    const orgAuth = await requireOrgForUser(userId, { permission: PERMISSIONS.USERS_VIEW });
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const userThreads = await getThreadsForUser(orgAuth.userId);
      return NextResponse.json({ threads: userThreads });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load threads");
  }
}
