require("dotenv").config();

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import { isSessionOpen } from "@/lib/whatsapp/whatsapp-session";
import { toE164 } from "@/lib/whatsapp/E164";
import { getUserByNumber } from "@/lib/repos/user.repo";
import { getOrganization } from "@/lib/repos/organizations.repo";
import {
  assertUsersBelongToOrg,
  handleApiError,
  requireAllRecipientsToBeKnownUsers,
  requireOwnedOrg,
} from "@/lib/auth/guards";

const supabase = getSupabaseAdminClient();

export async function POST(req) {
  try {
    const {
      orgId,
      recipients = [],
      message = "",
      imageUrls = [],
      waitHours = 48,
    } = await req.json();

    if (!orgId || recipients.length === 0) {
      return NextResponse.json(
        { error: "orgId e recipients são precisos" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const recipientUserIds = requireAllRecipientsToBeKnownUsers(recipients);

    await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      recipientUserIds,
    );

    const org = await getOrganization(orgAuth.orgId);

    if (!org?.channel_id) {
      return NextResponse.json(
        { error: "Organização não tem channel_id" },
        { status: 400 },
      );
    }

    const results = [];

    for (const rcp of recipients) {
      try {
      } catch (err) {
        results.push({ recipient: rcp, ok: false, reason: String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      orgId: orgAuth.orgId,
      recipients: recipientUserIds.length,
      results,
    });
  } catch (err) {
    return handleApiError(err, "Failed to process WhatsApp broadcast");
  }
}
