import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";

import { getMessagesInThread } from "@/lib/repos/messages.repo";

import { handleApiError, requireOrgForThread } from "@/lib/auth/guards";

export async function GET(_req, { params }) {
  try {
    /*
     * Next.js 16:
     *
     * route params are asynchronous.
     */
    const { threadId } = await params;

    /*
     * Authorization happens before reading
     * any messages.
     *
     * requireOrgForThread() also validates
     * and parses the DB thread ID.
     */
    const orgAuth = await requireOrgForThread(threadId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    return await withSessionReadAccess(orgAuth, async () => {
      const messages = await getMessagesInThread(orgAuth.threadId);

      return NextResponse.json(
        {
          messages,
        },
        {
          status: 200,
        },
      );
    });
  } catch (err) {
    return handleApiError(err, "Failed to load thread messages");
  }
}
