import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";

import { updateAssistant, deleteAssistant } from "@/lib/repos/assistants.repo";

import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

import {
  cleanPatch,
  handleApiError,
  requireOrgForAssistant,
} from "@/lib/auth/guards";

const ALLOWED_ASSISTANT_PATCH_FIELDS = [
  "name",
  "description",
  "instructions",
  "model",
  "top_p",
  "temperature",
];

export async function GET(_req, { params }) {
  try {
    const { assistantId } = await params;

    const orgAuth = await requireOrgForAssistant(assistantId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    return await withSessionReadAccess(orgAuth, async () => {
      return NextResponse.json(
        {
          ...orgAuth.assistant,
          vectorStoreId: orgAuth.assistant.vector_store_id ?? null,
        },
        {
          status: 200,
        },
      );
    });
  } catch (err) {
    return handleApiError(err, "Failed to load assistant");
  }
}

export async function PATCH(req, { params }) {
  try {
    const { assistantId } = await params;

    const updates = await req.json();

    const orgAuth = await requireOrgForAssistant(assistantId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    const patch = cleanPatch(updates, ALLOWED_ASSISTANT_PATCH_FIELDS);

    if (!Object.keys(patch).length) {
      return NextResponse.json(
        {
          error: "No valid fields provided to update.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * =========================================================
     * DB-ONLY ASSISTANT
     * =========================================================
     *
     * There is no OpenAI Assistant object anymore.
     *
     * Updating Supabase is enough because the next
     * Responses API request reads these values directly
     * from our DB Assistant configuration.
     */
    const updated = await updateAssistant(orgAuth.assistantId, patch);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.ASSISTANT_UPDATED,
      entityId: orgAuth.assistantId,
      entityLabel: updated?.name ?? orgAuth.assistant?.name,
      details: { fields: Object.keys(patch) },
    });

    return NextResponse.json(
      {
        ...updated,

        vectorStoreId: updated.vector_store_id ?? null,
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    return handleApiError(err, "Failed to update assistant");
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { assistantId } = await params;

    const orgAuth = await requireOrgForAssistant(assistantId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    /*
     * There is no OpenAI Assistant object to delete.
     *
     * Delete only our DB Assistant.
     */
    await deleteAssistant(orgAuth.assistantId);

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.ASSISTANT_DELETED,
      entityId: orgAuth.assistantId,
      entityLabel: orgAuth.assistant?.name,
      details: { model: orgAuth.assistant?.model ?? null },
    });

    return new NextResponse(null, {
      status: 204,
    });
  } catch (err) {
    return handleApiError(err, "Failed to delete assistant");
  }
}
