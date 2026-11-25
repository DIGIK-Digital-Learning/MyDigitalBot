import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  assertTagsBelongToOrg,
  assertUsersBelongToOrg,
  handleApiError,
  requireOrgForUser,
} from "@/lib/auth/guards";

export async function POST(req) {
  try {
    const { ids = [], tagIds = [], op = "add" } = await req.json();

    const userIds = ids.map(Number).filter(Boolean);
    const tagIdsNum = tagIds.map(Number).filter(Boolean);

    if (!userIds.length) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    if (!tagIdsNum.length && op !== "set") {
      return NextResponse.json({ error: "tagIds required" }, { status: 400 });
    }

    const orgAuth = await requireOrgForUser(userIds[0]);
    if (orgAuth.error) return orgAuth.error;

    const safeUserIds = await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      userIds,
    );

    const safeTagIds = await assertTagsBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      tagIdsNum,
    );

    const audit = () =>
      recordAuditEvent(orgAuth, {
        action: AUDIT_ACTIONS.USER_TAGS_UPDATED,
        details: {
          op,
          userCount: safeUserIds.length,
          userIds: safeUserIds,
          tagIds: safeTagIds,
        },
      });

    if (op === "add") {
      const rows = [];
      for (const uid of safeUserIds) {
        for (const tid of safeTagIds) rows.push({ user_id: uid, tag_id: tid });
      }

      const { error } = await orgAuth.admin
        .from("user_tag")
        .upsert(rows, { onConflict: "user_id,tag_id", ignoreDuplicates: true });

      if (error) throw error;
      await audit();
      return NextResponse.json({ ok: true });
    }

    if (op === "remove") {
      const { error } = await orgAuth.admin
        .from("user_tag")
        .delete()
        .in("user_id", safeUserIds)
        .in("tag_id", safeTagIds);

      if (error) throw error;
      await audit();
      return NextResponse.json({ ok: true });
    }

    if (op === "set") {
      const { error: delErr } = await orgAuth.admin
        .from("user_tag")
        .delete()
        .in("user_id", safeUserIds);

      if (delErr) throw delErr;

      if (!safeTagIds.length) {
        await audit();
        return NextResponse.json({ ok: true });
      }

      const rows = [];
      for (const uid of safeUserIds) {
        for (const tid of safeTagIds) rows.push({ user_id: uid, tag_id: tid });
      }

      const { error: addErr } = await orgAuth.admin
        .from("user_tag")
        .upsert(rows, { onConflict: "user_id,tag_id", ignoreDuplicates: true });

      if (addErr) throw addErr;
      await audit();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "invalid op" }, { status: 400 });
  } catch (error) {
    return handleApiError(error, "Failed to update user tags");
  }
}