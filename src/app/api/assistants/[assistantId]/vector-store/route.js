import { NextResponse } from "next/server";

import {
  createOpenAiVectorStore,
  uploadOpenAiFilesFromStorage,
} from "@/lib/services/openaiFiles.service";

import { associateVectorStoreToDbAssistant } from "@/lib/repos/assistants.repo";

import { createDBStore } from "@/lib/repos/store.repo";

import { requireOrgForAssistant, handleApiError } from "@/lib/auth/guards";

import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  getOrgLimits,
  hasRoomFor,
  limitReachedBody,
} from "@/lib/services/plans/planLimits";

export async function POST(req, ctx) {
  try {
    const { assistantId } = await ctx.params;

    /*
     * =========================================================
     * AUTHORIZE ASSISTANT
     * =========================================================
     *
     * Ensures:
     *
     * - Assistant exists
     * - Logged-in user owns its organization
     */
    const auth = await requireOrgForAssistant(assistantId);

    if (auth.error) {
      return auth.error;
    }

    const { storeName, files } = await req.json();

    if (typeof storeName !== "string" || !storeName.trim()) {
      return NextResponse.json(
        {
          error: "Vector store name is required",
        },
        {
          status: 400,
        },
      );
    }

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        {
          error: "At least one file is required",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Ficheiros por assistente (#185), antes de enviar para a OpenAI: se for
     * recusado, nada é enviado nem pago.
     */
    const orgLimits = await getOrgLimits(auth.orgId);

    if (!hasRoomFor(orgLimits.limits.filesPerAssistant, 0, files.length)) {
      return NextResponse.json(
        limitReachedBody(
          "ASSISTANT_FILE_LIMIT_REACHED",
          "filesPerAssistant",
          orgLimits,
        ),
        { status: 409 },
      );
    }

    const { fileIds: uploadedOpenAiIds, fileRows: fileRowsForDb } =
      await uploadOpenAiFilesFromStorage(files, auth.orgId);

    /*
     * =========================================================
     * OPENAI VECTOR STORE
     * =========================================================
     *
     * Vector Stores still exist independently
     * from OpenAI Assistants.
     */
    const oaiStore = await createOpenAiVectorStore(
      storeName.trim(),
      uploadedOpenAiIds,
    );

    if (!oaiStore?.id) {
      throw new Error("OpenAI did not return a vector store ID");
    }

    /*
     * =========================================================
     * LOCAL DB VECTOR STORE
     * =========================================================
     */
    const dbStore = await createDBStore(
      {
        name: oaiStore.name || storeName.trim(),

        open_ai_id: oaiStore.id,
      },

      fileRowsForDb,
    );

    /*
     * =========================================================
     * ASSOCIATE WITH OUR DB ASSISTANT
     * =========================================================
     *
     * IMPORTANT:
     *
     * There is no:
     *
     * associateStoreToAssistant()
     *
     * because there is no OpenAI Assistant object anymore.
     *
     * The Responses API receives this Vector Store through:
     *
     * tools: [
     *   {
     *     type: "file_search",
     *     vector_store_ids: [...]
     *   }
     * ]
     */
    await associateVectorStoreToDbAssistant(auth.assistantId, dbStore.id);

    await recordAuditEvent(auth, {
      action: AUDIT_ACTIONS.ASSISTANT_FILES_ADDED,
      entityId: auth.assistantId,
      entityLabel: auth.assistant?.name,
      details: {
        storeId: dbStore.id,
        storeName: dbStore.store_name,
        fileCount: fileRowsForDb.length,
        fileNames: fileRowsForDb.map((file) => file.name),
      },
    });

    return NextResponse.json(
      {
        id: dbStore.id,

        storeName: dbStore.store_name,

        files: (dbStore.file || []).map(({ id, name, size }) => ({
          id,
          name,
          size,
        })),
      },
      {
        status: 201,
      },
    );
  } catch (err) {
    return handleApiError(err, "Failed to create vector store");
  }
}
