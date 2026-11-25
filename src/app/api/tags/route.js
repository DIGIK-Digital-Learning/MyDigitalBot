import { withSessionReadAccess, getSessionReadClient } from "@/lib/db/readAccess";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  getTagsInOrg,
  createTag,
  updateTag,
  deleteTag,
} from "@/lib/repos/tag.repo.js";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  cleanPatch,
  handleApiError,
  requireOrgForTag,
  requireOwnedOrg,
} from "@/lib/auth/guards";

const ALLOWED_TAG_PATCH_FIELDS = [
  "name",
  "color",
  "is_archived",
];

const MAX_TAG_NAME_LENGTH = 100;
const MAX_COLOR_LENGTH = 50;

function validateName(value, { required = false } = {}) {
  if (value == null) {
    return required
      ? { error: "Tag name is required." }
      : { value: undefined };
  }

  if (typeof value !== "string") {
    return { error: "Tag name must be a string." };
  }

  const normalized = value.trim();

  if (!normalized) {
    return { error: "Tag name cannot be empty." };
  }

  if (normalized.length > MAX_TAG_NAME_LENGTH) {
    return {
      error: `Tag name must not exceed ${MAX_TAG_NAME_LENGTH} characters.`,
    };
  }

  return { value: normalized };
}

function validateColor(value) {
  if (value == null || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: "Tag color must be a string." };
  }

  const normalized = value.trim();

  if (normalized.length > MAX_COLOR_LENGTH) {
    return {
      error: `Tag color must not exceed ${MAX_COLOR_LENGTH} characters.`,
    };
  }

  return { value: normalized || null };
}

/*
 * O nome repete-se quando o slug já existe na organização (índice
 * tags_org_slug_uidx). É um erro de quem pede, não do servidor.
 */
function duplicateNameResponse(error) {
  if (error?.code !== "23505") return null;

  return NextResponse.json(
    {
      error: "A tag with this name already exists.",
      code: "tag_name_taken",
    },
    { status: 409 },
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawOrgId = searchParams.get("orgId");

    if (rawOrgId == null || rawOrgId === "") {
      return NextResponse.json(
        { error: "Missing orgId" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(rawOrgId);
    if (orgAuth.error) return orgAuth.error;

    return await withSessionReadAccess(orgAuth, async () => {
      const data = await getTagsInOrg(
        getSessionReadClient(orgAuth),
        orgAuth.orgId,
      );

      return NextResponse.json(
        Array.isArray(data) ? data : [],
      );
    });
  } catch (error) {
    return handleApiError(
      error,
      "Failed to load tags",
    );
  }
}

export async function POST(req) {
  try {
    let body;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { orgId, name, color } = body;

    if (orgId == null || orgId === "") {
      return NextResponse.json(
        { error: "Missing orgId" },
        { status: 400 },
      );
    }

    const nameResult = validateName(name, {
      required: true,
    });

    if (nameResult.error) {
      return NextResponse.json(
        { error: nameResult.error },
        { status: 400 },
      );
    }

    const colorResult = validateColor(color);

    if (colorResult.error) {
      return NextResponse.json(
        { error: colorResult.error },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    const tag = await createTag(orgAuth.admin, {
      orgId: orgAuth.orgId,
      name: nameResult.value,
      color: colorResult.value,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.TAG_CREATED,
      entityId: tag?.id,
      entityLabel: tag?.name ?? nameResult.value,
      details: { color: tag?.color ?? colorResult.value },
    });

    return NextResponse.json(
      tag,
      { status: 201 },
    );
  } catch (error) {
    return (
      duplicateNameResponse(error) ??
      handleApiError(error, "Failed to create tag")
    );
  }
}

export async function PATCH(req) {
  try {
    let body;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { id, ...fields } = body;

    const orgAuth = await requireOrgForTag(id);
    if (orgAuth.error) return orgAuth.error;

    const patch = cleanPatch(
      fields,
      ALLOWED_TAG_PATCH_FIELDS,
    );

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        {
          error:
            "No valid fields provided to update.",
        },
        { status: 400 },
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "name",
      )
    ) {
      const nameResult = validateName(patch.name);

      if (nameResult.error) {
        return NextResponse.json(
          { error: nameResult.error },
          { status: 400 },
        );
      }

      patch.name = nameResult.value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "color",
      )
    ) {
      const colorResult = validateColor(patch.color);

      if (colorResult.error) {
        return NextResponse.json(
          { error: colorResult.error },
          { status: 400 },
        );
      }

      patch.color = colorResult.value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "is_archived",
      ) &&
      typeof patch.is_archived !== "boolean"
    ) {
      return NextResponse.json(
        {
          error:
            "is_archived must be a boolean.",
        },
        { status: 400 },
      );
    }

    const updated = await updateTag(
      orgAuth.admin,
      orgAuth.tagId,
      patch,
    );

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.TAG_UPDATED,
      entityId: orgAuth.tagId,
      entityLabel: updated?.name ?? orgAuth.tag?.name,
      details: { fields: Object.keys(patch) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return (
      duplicateNameResponse(error) ??
      handleApiError(error, "Failed to update tag")
    );
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawId = searchParams.get("id");

    if (rawId == null || rawId === "") {
      return NextResponse.json(
        { error: "Missing tag id" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOrgForTag(rawId);
    if (orgAuth.error) return orgAuth.error;

    await deleteTag(
      orgAuth.admin,
      orgAuth.tagId,
    );

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.TAG_DELETED,
      entityId: orgAuth.tagId,
      entityLabel: orgAuth.tag?.name,
      details: { color: orgAuth.tag?.color ?? null },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return handleApiError(
      error,
      "Failed to delete tag",
    );
  }
}