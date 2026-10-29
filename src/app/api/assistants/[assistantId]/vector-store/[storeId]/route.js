import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";

import {
  getStoreById,
  updateStoreName,
  deleteStoreById,
} from "@/lib/repos/store.repo";

import { createDBFiles, deleteFileById } from "@/lib/repos/files.repo";
import {
  getOrgLimits,
  hasRoomFor,
  limitKeepingCurrent,
  limitReachedBody,
} from "@/lib/services/plans/planLimits";

import { nullifyVectorStoreToDbAssistant } from "@/lib/repos/assistants.repo";

import {
  attachOpenAiFileToVectorStore,
  deleteOpenAiFile,
  deleteOpenAiVectorStoreAndFiles,
  detachOpenAiFileFromVectorStore,
  updateOpenAiVectorStore,
  uploadOpenAiFilesFromStorage,
} from "@/lib/services/openaiFiles.service";

import { requireOrgForAssistant, handleApiError } from "@/lib/auth/guards";

import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";

function serializeStore(store) {
  return {
    id: store.id,
    storeName: store.store_name,
    files: (store.file || []).map(({ id, name, size }) => ({
      id,
      name,
      size,
    })),
  };
}

async function cleanupNewOpenAiFiles(
  vectorStoreId,
  fileIds = [],
  attachedFileIds = [],
) {
  for (const fileId of attachedFileIds) {
    try {
      await detachOpenAiFileFromVectorStore(vectorStoreId, fileId);
    } catch (error) {
      console.error(
        `[Vector Store PATCH] failed to detach new file ${fileId}:`,
        error,
      );
    }
  }

  for (const fileId of fileIds) {
    try {
      await deleteOpenAiFile(fileId);
    } catch (error) {
      console.error(
        `[Vector Store PATCH] failed to clean up new file ${fileId}:`,
        error,
      );
    }
  }
}

/* =========================================================
   GET VECTOR STORE
   ========================================================= */

export async function GET(_req, { params }) {
  try {
    const { assistantId, storeId } = await params;

    const auth = await requireOrgForAssistant(assistantId);

    if (auth.error) {
      return auth.error;
    }

    return await withSessionReadAccess(auth, async () => {
      const sId = Number(storeId);

      if (!Number.isInteger(sId) || sId <= 0) {
        return NextResponse.json(
          {
            error: "Invalid store id",
          },
          {
            status: 400,
          },
        );
      }

      /*
       * Do not reveal whether some other
       * Assistant's Vector Store exists.
       */
      if (Number(auth.assistant.vector_store_id) !== sId) {
        return NextResponse.json(
          {
            error: "Not found",
          },
          {
            status: 404,
          },
        );
      }

      const store = await getStoreById(sId);

      if (!store) {
        return NextResponse.json(
          {
            error: "Not found",
          },
          {
            status: 404,
          },
        );
      }

      return NextResponse.json(serializeStore(store), {
        status: 200,
      });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load vector store");
  }
}

/* =========================================================
   UPDATE VECTOR STORE
   ========================================================= */

export async function PATCH(req, { params }) {
  let uploadedOpenAiIds = [];
  let attachedOpenAiIds = [];
  let openAiStoreId = "";

  try {
    const { assistantId, storeId } = await params;

    const auth = await requireOrgForAssistant(assistantId);

    if (auth.error) {
      return auth.error;
    }

    const sId = Number(storeId);

    if (!Number.isInteger(sId) || sId <= 0) {
      return NextResponse.json(
        {
          error: "Invalid store id",
        },
        {
          status: 400,
        },
      );
    }

    if (Number(auth.assistant.vector_store_id) !== sId) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    }

    const store = await getStoreById(sId);

    if (!store) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    }

    const body = await req.json();
    const rawFiles = body?.files ?? [];
    const rawRemovedFileIds = body?.removedFileIds ?? [];

    if (!Array.isArray(rawFiles)) {
      return NextResponse.json(
        {
          error: "Files must be an array",
        },
        {
          status: 400,
        },
      );
    }

    if (!Array.isArray(rawRemovedFileIds)) {
      return NextResponse.json(
        {
          error: "removedFileIds must be an array",
        },
        {
          status: 400,
        },
      );
    }

    const storeFiles = store.file || [];
    const filesById = new Map(
      storeFiles.map((file) => [Number(file.id), file]),
    );
    const removedFileIds = [
      ...new Set(rawRemovedFileIds.map((fileId) => Number(fileId))),
    ];

    if (
      removedFileIds.some(
        (fileId) =>
          !Number.isInteger(fileId) || fileId <= 0 || !filesById.has(fileId),
      )
    ) {
      return NextResponse.json(
        {
          error: "One or more files do not belong to this vector store",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * Ficheiros por assistente (#185), só quando se juntam ficheiros: mudar
     * o nome ou tirar ficheiros nunca é recusado. Conta os que ficam
     * (existentes − tirados) mais os novos, por isso quem está no máximo
     * pode trocar um por outro. Uma coleção antiga acima do limite pode ficar
     * com os que tinha, mas não crescer (limitKeepingCurrent). Antes de
     * enviar para a OpenAI: se for recusado, nada é enviado nem pago.
     */
    const orgLimits = await getOrgLimits(auth.orgId);
    const keptFiles = storeFiles.length - removedFileIds.length;
    const filesLimit = limitKeepingCurrent(
      orgLimits.limits.filesPerAssistant,
      storeFiles.length,
    );

    if (rawFiles.length > 0 && !hasRoomFor(filesLimit, keptFiles, rawFiles.length)) {
      return NextResponse.json(
        {
          ...limitReachedBody(
            "ASSISTANT_FILE_LIMIT_REACHED",
            "filesPerAssistant",
            orgLimits,
          ),
          limit: filesLimit,
        },
        { status: 409 },
      );
    }

    const storeName =
      body?.storeName === undefined
        ? String(store.store_name || "").trim()
        : typeof body.storeName === "string"
          ? body.storeName.trim()
          : "";

    if (!storeName) {
      return NextResponse.json(
        {
          error: "Vector store name is required",
        },
        {
          status: 400,
        },
      );
    }

    openAiStoreId = String(store.open_ai_id || "").trim();

    if (!openAiStoreId) {
      throw new Error("Vector store has no OpenAI vector store ID");
    }

    const uploaded = await uploadOpenAiFilesFromStorage(rawFiles, auth.orgId);
    uploadedOpenAiIds = uploaded.fileIds;

    for (const fileId of uploadedOpenAiIds) {
      await attachOpenAiFileToVectorStore(openAiStoreId, fileId);
      attachedOpenAiIds.push(fileId);
    }

    for (const fileId of removedFileIds) {
      const existingFile = filesById.get(fileId);

      // The local row is only removed after the OpenAI resource is detached.
      await detachOpenAiFileFromVectorStore(
        openAiStoreId,
        existingFile.open_ai_id,
      );
      await deleteOpenAiFile(existingFile.open_ai_id);
    }

    if (storeName !== String(store.store_name || "").trim()) {
      await updateOpenAiVectorStore(openAiStoreId, { name: storeName });
      await updateStoreName(sId, storeName);
    }

    if (uploaded.fileRows.length) {
      await createDBFiles(uploaded.fileRows, sId);
    }

    for (const fileId of removedFileIds) {
      await deleteFileById(fileId);
    }

    const updatedStore = await getStoreById(sId);

    return NextResponse.json(serializeStore(updatedStore || store), {
      status: 200,
    });
  } catch (err) {
    await cleanupNewOpenAiFiles(
      openAiStoreId,
      uploadedOpenAiIds,
      attachedOpenAiIds,
    );

    return handleApiError(err, "Failed to update vector store");
  }
}

/* =========================================================
   DELETE VECTOR STORE
   ========================================================= */

export async function DELETE(_req, { params }) {
  try {
    const { assistantId, storeId } = await params;

    const auth = await requireOrgForAssistant(assistantId);

    if (auth.error) {
      return auth.error;
    }

    const sId = Number(storeId);

    if (!Number.isInteger(sId) || sId <= 0) {
      return NextResponse.json(
        {
          error: "Invalid store id",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Prevent deleting another Assistant's
     * Vector Store by guessing the ID.
     */
    if (Number(auth.assistant.vector_store_id) !== sId) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    }

    const store = await getStoreById(sId);

    if (!store) {
      return NextResponse.json(
        {
          error: "Not found",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * These OpenAI IDs are still valid.
     *
     * They belong to:
     *
     * OpenAI Files
     * OpenAI Vector Stores
     *
     * NOT OpenAI Assistants.
     */
    const openAiFileIds = (store.file ?? [])
      .map((file) => file.open_ai_id)
      .filter(Boolean);

    const openAiStoreId = store.open_ai_id;

    /*
     * Disconnect the Vector Store from
     * our DB Assistant first.
     */
    await nullifyVectorStoreToDbAssistant(auth.assistantId);

    /*
     * Delete the real OpenAI resources.
     *
     * If OpenAI cleanup fails, we still
     * continue removing our local records
     * so the Assistant is not left linked
     * to a broken store.
     */
    try {
      await deleteOpenAiVectorStoreAndFiles(openAiStoreId, openAiFileIds);
    } catch (err) {
      console.error("[Vector Store DELETE] OpenAI cleanup failed:", err);
    }

    /*
     * Delete local file rows.
     */
    for (const file of store.file ?? []) {
      await deleteFileById(file.id);
    }

    /*
     * Delete local Vector Store row.
     */
    await deleteStoreById(sId);

    await recordAuditEvent(auth, {
      action: AUDIT_ACTIONS.ASSISTANT_FILES_REMOVED,
      entityId: auth.assistantId,
      entityLabel: auth.assistant?.name,
      details: {
        storeId: sId,
        storeName: store.store_name,
        fileCount: (store.file ?? []).length,
        fileNames: (store.file ?? []).map((file) => file.name),
      },
    });

    return NextResponse.json(
      {
        message: "Vector store and files deleted",
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    return handleApiError(err, "Failed to delete vector store");
  }
}
