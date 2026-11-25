import { NextResponse } from "next/server";
import { deleteUser } from "@/lib/repos/user.repo";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { lookupAssistantName } from "@/lib/services/audit/auditLookups";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  assertAssistantBelongsToOrg,
  assertUsersBelongToOrg,
  handleApiError,
  requireOrgForUser,
  requireOwnedOrg,
} from "@/lib/auth/guards";

export async function PATCH(req) {
  try {
    const { ids, assistantId, orgId, mode } = await req.json();
    const userIds = (ids || []).map(Number).filter(Boolean);

    if (!Array.isArray(ids) || userIds.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const safeUserIds = await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      userIds,
    );

    const safeAssistantId = await assertAssistantBelongsToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      assistantId,
    );

    // "add": junta o assistente aos já atribuídos e só o torna ativo em quem
    // não tinha nenhum. Sem modo: os utilizadores ficam só com este (#131).
    if (mode === "add" && safeAssistantId) {
      const { error: addError } = await orgAuth.admin
        .from("user_assistant")
        .upsert(
          safeUserIds.map((userId) => ({
            user_id: userId,
            assistant_id: safeAssistantId,
          })),
          { onConflict: "user_id,assistant_id", ignoreDuplicates: true },
        );

      if (addError) throw addError;

      const { error: activeError } = await orgAuth.admin
        .from("user")
        .update({ assistant_id: safeAssistantId })
        .in("id", safeUserIds)
        .eq("organization_id", orgAuth.orgId)
        .is("assistant_id", null);

      if (activeError) throw activeError;

      return NextResponse.json({ ok: true });
    }

    const { error } = await orgAuth.admin
      .from("user")
      .update({ assistant_id: safeAssistantId })
      .in("id", safeUserIds)
      .eq("organization_id", orgAuth.orgId);

    if (error) throw error;

    let others = orgAuth.admin
      .from("user_assistant")
      .delete()
      .in("user_id", safeUserIds);

    if (safeAssistantId) {
      others = others.neq("assistant_id", safeAssistantId);
    }

    const { error: othersError } = await others;

    if (othersError) throw othersError;

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.USER_BULK_UPDATED,
      details: {
        count: safeUserIds.length,
        userIds: safeUserIds,
        assistantId: safeAssistantId,
        assistantName: await lookupAssistantName(
          orgAuth.admin,
          safeAssistantId,
        ),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Failed to update users");
  }
}

export async function DELETE(req) {
  try {
    const { ids } = await req.json();
    const userIds = (ids || []).map(Number).filter(Boolean);

    if (!Array.isArray(ids) || userIds.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const orgAuth = await requireOrgForUser(userIds[0]);
    if (orgAuth.error) return orgAuth.error;

    const safeUserIds = await assertUsersBelongToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      userIds,
    );

    const results = await Promise.allSettled(
      safeUserIds.map((id) => deleteUser(id)),
    );

    const failed = results
      .map((result, index) => ({ result, id: safeUserIds[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, id }) => ({
        id,
        error: result.reason?.message || "Failed to delete user",
      }));

    if (failed.length < safeUserIds.length) {
      const failedIds = new Set(failed.map((item) => item.id));

      await recordAuditEvent(orgAuth, {
        action: AUDIT_ACTIONS.USER_BULK_DELETED,
        details: {
          count: safeUserIds.length - failed.length,
          userIds: safeUserIds.filter((id) => !failedIds.has(id)),
          failedCount: failed.length,
        },
      });
    }

    return NextResponse.json({
      ok: failed.length === 0,
      deleted: safeUserIds.length - failed.length,
      failedCount: failed.length,
      failed,
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete users");
  }
}
