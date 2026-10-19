import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import { getMessagesInThread } from "@/lib/repos/messages.repo";
import { handleApiError, requireOrgForThread } from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = Number(searchParams.get("threadId"));

    const orgAuth = await requireOrgForThread(threadId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const messages = await getMessagesInThread(orgAuth.threadId);
      return NextResponse.json({ messages });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load messages");
  }
}
