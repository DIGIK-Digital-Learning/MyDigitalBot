import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// /src/lib/repos/files.repo.js

/**
 * Table: file
 *  - id (int4, PK)
 *  - vector_store_id (int4, FK -> vector_store.id)
 *  - open_ai_id (text)
 *  - name (text)
 *  - size (int4)
 *
 * IMPORTANT:
 *  • Leituras da interface usam a sessão; escritas usam service role no servidor.
 *  • Prefer DB-level cleanup via ON DELETE CASCADE on file.vector_store_id
 */

/** Create a single file row */
export async function createDBFile(openAiId, file, vectorStoreId = null) {
  const sb = getSupabaseAdminClient();
  const payload = {
    open_ai_id: openAiId ?? null,
    name: file?.name ?? null,
    size: file?.size ?? null,
    vector_store_id: vectorStoreId ?? null,
  };

  const { data, error } = await sb
    .from("file")
    .insert([payload])
    .select()
    .single();
  if (error) throw error;
  return data; // { id, open_ai_id, name, size, vector_store_id }
}

/** Bulk create file rows; accepts [{ open_ai_id, name, size }] */
export async function createDBFiles(fileRows = [], vectorStoreId = null) {
  const sb = getSupabaseAdminClient();
  if (!Array.isArray(fileRows) || fileRows.length === 0) return [];

  const toInsert = fileRows.map((f) => ({
    vector_store_id: vectorStoreId ?? null,
    open_ai_id: f.open_ai_id ?? f.openAiId ?? null,
    name: f.name ?? null,
    size: f.size ?? null,
  }));

  const { data, error } = await sb.from("file").insert(toInsert).select();
  if (error) throw error;
  return data; // array of inserted rows
}

/** Get one file by id */
export async function getFileById(id) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("file")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** List files for a vector store */
export async function getFilesByVectorStoreId(vectorStoreId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("file")
    .select("*")
    .eq("vector_store_id", vectorStoreId);
  if (error) throw error;
  return data ?? [];
}

/** Delete a single file row */
export async function deleteFileById(id) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb.from("file").delete().eq("id", id);
  if (error) throw error;
  return true;
}

/**
 * Delete all files of a vector store (useful if you DIDN'T set CASCADE).
 * If you have ON DELETE CASCADE, you can skip calling this and just delete the store.
 */
export async function deleteFilesByVectorStoreId(vectorStoreId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("file")
    .delete()
    .eq("vector_store_id", vectorStoreId);
  if (error) throw error;
  return true;
}

/** Optional: detach files from a vector store without deleting them */
export async function detachFilesFromVectorStore(vectorStoreId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("file")
    .update({ vector_store_id: null })
    .eq("vector_store_id", vectorStoreId);
  if (error) throw error;
  return true;
}
