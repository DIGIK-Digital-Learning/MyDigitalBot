import { openai } from "@/lib/openai/client";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import { toFile } from "openai/uploads";

const storageClient = getSupabaseAdminClient();

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanResourceId(value, resourceName) {
  const id = String(value || "").trim();

  if (!id) {
    throw new Error(`${resourceName} is required`);
  }

  return id;
}

function normalizeFileSize(size) {
  const parsedSize = Number(size);

  return Number.isFinite(parsedSize) && parsedSize >= 0
    ? Math.trunc(parsedSize)
    : null;
}

/**
 * Upload a file to OpenAI.
 *
 * Files are still real OpenAI resources even though
 * OpenAI Assistants no longer exist in our architecture.
 */
export async function createOpenAiFile(file) {
  try {
    return await openai.files.create({
      file,
      purpose: "user_data",
    });
  } catch (err) {
    console.error("[OpenAI File Upload] failed:", err);

    throw err;
  }
}

/**
 * Download staged files from Supabase Storage and create OpenAI File
 * resources for them. The caller can then attach the returned IDs to a
 * Vector Store or use them when creating one.
 */
export async function uploadOpenAiFilesFromStorage(files, organizationId) {
  if (!Array.isArray(files)) {
    throw createHttpError("Files must be an array", 400);
  }

  const orgPrefix = `${String(organizationId || "").trim()}/`;

  if (orgPrefix === "/") {
    throw createHttpError("Organization id is required", 400);
  }

  const uploadedOpenAiIds = [];
  const fileRows = [];

  try {
    for (const stagedFile of files) {
      const { bucket, path, name, type, size } = stagedFile || {};
      const cleanBucket = typeof bucket === "string" ? bucket.trim() : "";
      const cleanPath = typeof path === "string" ? path.trim() : "";
      const cleanName =
        typeof name === "string" && name.trim() ? name.trim() : "upload.bin";

      if (!cleanBucket || !cleanPath) {
        throw createHttpError("Each file requires bucket and path", 400);
      }

      if (!cleanPath.startsWith(orgPrefix)) {
        throw createHttpError(
          "File does not belong to this organization",
          403,
        );
      }

      const { data: signed, error: signError } = await storageClient.storage
        .from(cleanBucket)
        .createSignedUrl(cleanPath, 60);

      if (signError) {
        throw signError;
      }

      if (!signed?.signedUrl) {
        throw new Error(`Could not create signed URL for ${cleanPath}`);
      }

      const response = await fetch(signed.signedUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${cleanPath} from Supabase Storage: ${response.status} ${response.statusText}`,
        );
      }

      const fileLike = await toFile(
        response.body ?? (await response.blob()),
        cleanName,
        {
          type:
            (typeof type === "string" && type.trim() ? type.trim() : null) ||
            response.headers.get("content-type") ||
            "application/octet-stream",
        },
      );

      const uploaded = await createOpenAiFile(fileLike);

      if (!uploaded?.id) {
        throw new Error(`OpenAI did not return a file ID for ${cleanName}`);
      }

      uploadedOpenAiIds.push(uploaded.id);
      fileRows.push({
        open_ai_id: uploaded.id,
        name: cleanName,
        size: normalizeFileSize(size),
      });
    }

    return {
      fileIds: uploadedOpenAiIds,
      fileRows,
    };
  } catch (error) {
    // Do not leave partially uploaded OpenAI files behind when staging fails.
    for (const fileId of uploadedOpenAiIds) {
      try {
        await deleteOpenAiFile(fileId);
      } catch (cleanupError) {
        console.error(
          `[OpenAI File Cleanup] failed for ${fileId}:`,
          cleanupError,
        );
      }
    }

    throw error;
  }
}

/**
 * Create an OpenAI Vector Store from already
 * uploaded OpenAI file IDs.
 */
export async function createOpenAiVectorStore(storeName, uploadedFileIds) {
  const cleanName = typeof storeName === "string" ? storeName.trim() : "";

  if (!cleanName) {
    throw new Error("Vector store name cannot be empty");
  }

  if (!Array.isArray(uploadedFileIds) || uploadedFileIds.length === 0) {
    throw new Error("At least one OpenAI file ID is required");
  }

  const fileIds = uploadedFileIds
    .map((fileId) => String(fileId || "").trim())
    .filter(Boolean);

  if (!fileIds.length) {
    throw new Error("At least one valid OpenAI file ID is required");
  }

  try {
    return await openai.vectorStores.create({
      name: cleanName,

      file_ids: fileIds,
    });
  } catch (err) {
    console.error("[OpenAI Vector Store Create] failed:", err);

    throw err;
  }
}

/** Update the name/metadata of an existing OpenAI Vector Store. */
export async function updateOpenAiVectorStore(vectorStoreId, updates) {
  const cleanVectorStoreId = cleanResourceId(vectorStoreId, "Vector store ID");

  return await openai.vectorStores.update(cleanVectorStoreId, updates);
}

/** Attach an existing OpenAI File to an existing Vector Store. */
export async function attachOpenAiFileToVectorStore(vectorStoreId, fileId) {
  const cleanVectorStoreId = cleanResourceId(vectorStoreId, "Vector store ID");
  const cleanFileId = cleanResourceId(fileId, "File ID");

  const vectorStoreFile = await openai.vectorStores.files.create(
    cleanVectorStoreId,
    {
      file_id: cleanFileId,
    },
  );

  if (!vectorStoreFile?.id) {
    throw new Error(`OpenAI did not attach file ${cleanFileId}`);
  }

  return vectorStoreFile;
}

/** Remove an OpenAI File from a Vector Store without deleting the File. */
export async function detachOpenAiFileFromVectorStore(vectorStoreId, fileId) {
  const cleanVectorStoreId = cleanResourceId(vectorStoreId, "Vector store ID");
  const cleanFileId = cleanResourceId(fileId, "File ID");

  return await openai.vectorStores.files.del(
    cleanVectorStoreId,
    cleanFileId,
  );
}

/** Delete an OpenAI File resource. */
export async function deleteOpenAiFile(fileId) {
  const cleanFileId = cleanResourceId(fileId, "File ID");

  return await openai.files.del(cleanFileId);
}

/** Detach a file from a Vector Store and then delete the File resource. */
export async function removeOpenAiFileFromVectorStore(vectorStoreId, fileId) {
  await detachOpenAiFileFromVectorStore(vectorStoreId, fileId);
  return await deleteOpenAiFile(fileId);
}

/**
 * Delete an OpenAI Vector Store and the files
 * belonging to it.
 */
export async function deleteOpenAiVectorStoreAndFiles(
  vectorStoreId,
  fileIds = [],
) {
  const cleanFileIds = Array.isArray(fileIds)
    ? fileIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  /*
   * Delete the files first.
   */
  for (const fileId of cleanFileIds) {
    try {
      await deleteOpenAiFile(fileId);
    } catch (err) {
      console.error(`[OpenAI File Delete] failed for ${fileId}:`, err);

      throw err;
    }
  }

  const cleanVectorStoreId = String(vectorStoreId || "").trim();

  if (!cleanVectorStoreId) {
    return;
  }

  /*
   * Delete the vector store itself.
   */
  try {
    await openai.vectorStores.del(cleanVectorStoreId);
  } catch (err) {
    console.error(
      `[OpenAI Vector Store Delete] failed for ${cleanVectorStoreId}:`,
      err,
    );

    throw err;
  }
}
