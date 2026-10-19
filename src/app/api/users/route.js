import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";
import {
  createUser,
  getUsersInOrg,
  updateUser,
  deleteUser,
} from "@/lib/repos/user.repo";
import { createUserWithAutomations } from "@/lib/services/automations/createUserWithAutomations";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { lookupAssistantName } from "@/lib/services/audit/auditLookups";
import { AUDIT_ACTIONS, providedFields } from "@/lib/audit/auditEvents";
import { resolveAssistantAssignment } from "@/lib/services/users/assistantAssignment";
import {
  assertAssistantBelongsToOrg,
  assertAssistantsBelongToOrg,
  assertTagsBelongToOrg,
  handleApiError,
  requireOrgForUser,
  requireOwnedOrg,
} from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgId = Number(searchParams.get("orgId"));
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || 100)),
    );

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const result = await getUsersInOrg(orgAuth.orgId, { page, pageSize });
      return NextResponse.json(result);
    });
  } catch (err) {
    return handleApiError(err, "Failed to load users");
  }
}

export async function POST(req) {
  try {
    const {
      name,
      phoneNumber,
      phoneCountryCode,
      phoneNational,
      organizationId,
      assistantId,
      assistantIds,
      email,
      teamsAadObjectId,
      teamsFromId,
    } = await req.json();

    if (!name || !organizationId) {
      return NextResponse.json(
        { error: "Missing required fields: name, organizationId" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(organizationId);
    if (orgAuth.error) return orgAuth.error;

    const safeAssistantId = await assertAssistantBelongsToOrg(
      orgAuth.admin,
      orgAuth.orgId,
      assistantId,
    );

    if (assistantIds !== undefined && !Array.isArray(assistantIds)) {
      return NextResponse.json(
        { error: "assistantIds must be an array" },
        { status: 400 },
      );
    }

    const safeAssistantIds =
      assistantIds !== undefined
        ? await assertAssistantsBelongToOrg(
            orgAuth.admin,
            orgAuth.orgId,
            assistantIds,
          )
        : undefined;

    const assignment = resolveAssistantAssignment({
      assistantIds: safeAssistantIds,
      assistantId: safeAssistantId ?? undefined,
    });

    const normalizedNational =
      typeof phoneNational === "string"
        ? phoneNational.replace(/\s+/g, "")
        : "";

    const normalizedCode =
      typeof phoneCountryCode === "string" && phoneCountryCode.trim()
        ? phoneCountryCode.trim()
        : null;

    const fullPhone =
      phoneNumber ??
      (normalizedCode && normalizedNational
        ? `${normalizedCode}${normalizedNational.replace(/\D/g, "")}`
        : null);

    const newUser = await createUserWithAutomations({
      organizationId: orgAuth.orgId,
      name,
      email,
      assistantId: assignment?.activeId ?? null,
      assistantIds: assignment?.ids,
      phoneNumber: fullPhone,
      phoneCountryCode: normalizedCode,
      phoneNational: normalizedNational,
      teamsAadObjectId: teamsAadObjectId ?? null,
      teamsFromId: teamsFromId ?? null,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.USER_CREATED,
      entityId: newUser?.id,
      entityLabel: newUser?.name ?? name,
      details: {
        email: newUser?.email ?? email ?? null,
        phone: newUser?.phone_number ?? fullPhone ?? null,
        assistantName: await lookupAssistantName(
          orgAuth.admin,
          safeAssistantId,
        ),
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error.code === "USER_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "This organization has reached its user limit." },
        { status: 409 },
      );
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "User already exists (duplicate key)." },
        { status: 409 },
      );
    }

    return handleApiError(error, "Failed to create user");
  }
}

export async function PATCH(req) {
  try {
    const {
      id,
      name,
      phoneNumber,
      phoneCountryCode,
      phoneNational,
      email,
      teamsAadObjectId,
      teamsFromId,
      assistantId,
      assistantIds,
      tagIds,
    } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOrgForUser(id);
    if (orgAuth.error) return orgAuth.error;

    const safeAssistantId =
      assistantId !== undefined
        ? await assertAssistantBelongsToOrg(
            orgAuth.admin,
            orgAuth.orgId,
            assistantId,
          )
        : undefined;

    if (assistantIds !== undefined && !Array.isArray(assistantIds)) {
      return NextResponse.json(
        { error: "assistantIds must be an array" },
        { status: 400 },
      );
    }

    const safeAssistantIds =
      assistantIds !== undefined
        ? await assertAssistantsBelongToOrg(
            orgAuth.admin,
            orgAuth.orgId,
            assistantIds,
          )
        : undefined;

    let safeTagIds = undefined;

    if (tagIds !== undefined) {
      if (!Array.isArray(tagIds)) {
        return NextResponse.json(
          { error: "tagIds must be an array" },
          { status: 400 },
        );
      }

      safeTagIds = await assertTagsBelongToOrg(
        orgAuth.admin,
        orgAuth.orgId,
        tagIds,
      );
    }

    const normalizedNational =
      typeof phoneNational === "string"
        ? phoneNational.replace(/\s+/g, "")
        : undefined;

    const normalizedCode =
      typeof phoneCountryCode === "string" && phoneCountryCode.trim()
        ? phoneCountryCode.trim()
        : typeof phoneCountryCode === "string"
          ? ""
          : undefined;

    const fullPhone =
      typeof phoneNumber === "string" && phoneNumber.trim()
        ? phoneNumber.trim()
        : normalizedCode && normalizedNational
          ? `${normalizedCode}${normalizedNational.replace(/\D/g, "")}`
          : undefined;

    const updatedUser = await updateUser(orgAuth.userId, {
      name,
      email,
      assistantId: safeAssistantId,
      assistantIds: safeAssistantIds,
      tagIds: safeTagIds,
      phoneNumber: fullPhone,
      phoneCountryCode: normalizedCode,
      phoneNational: normalizedNational,
      teamsAadObjectId,
      teamsFromId,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityId: orgAuth.userId,
      entityLabel: updatedUser?.name ?? orgAuth.targetUser?.name,
      details: {
        fields: providedFields({
          name,
          phoneNumber,
          phoneCountryCode,
          phoneNational,
          email,
          teamsAadObjectId,
          teamsFromId,
          assistantId,
          tagIds,
        }),
      },
    });

    return NextResponse.json(updatedUser);
  } catch (err) {
    return handleApiError(err, "Failed to update user");
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = Number(searchParams.get("id"));

    const orgAuth = await requireOrgForUser(userId);
    if (orgAuth.error) return orgAuth.error;

    await deleteUser(orgAuth.userId);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.USER_DELETED,
      entityId: orgAuth.userId,
      entityLabel: orgAuth.targetUser?.name,
      details: {
        email: orgAuth.targetUser?.email ?? null,
        phone: orgAuth.targetUser?.phone_number ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete user");
  }
}
