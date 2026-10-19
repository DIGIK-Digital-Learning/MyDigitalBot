import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// src/lib/repos/store.repo.js

/**
 * Table: vector_store
 *   id (int4), store_name (text), open_ai_id (text)  ← ensure this column exists
 *
 * Table: file
 *   id (int4), vector_store_id (int4 FK), open_ai_id (text), name (text), size (int4)
 */

export async function createDBStore(store, fileRows = []) {
  const sb = getSupabaseAdminClient();
  // 1) Create vector_store (persist OpenAI id too)
  const { data: vs, error: vsErr } = await sb
    .from("vector_store")
    .insert([{ store_name: store.name, open_ai_id: store.open_ai_id || null }])
    .select()
    .single();
  if (vsErr) throw vsErr;

  // 2) Attach files (if any)
  if (fileRows.length) {
    const toInsert = fileRows.map((f) => ({
      vector_store_id: vs.id,
      open_ai_id: f.open_ai_id,
      name: f.name,
      size: f.size,
    }));
    const { error: filesErr } = await sb.from("file").insert(toInsert);
    if (filesErr) throw filesErr;
  }

  // 3) Return the store *with* its files (id, name, size)
  const { data: full, error: fullErr } = await sb
    .from("vector_store")
    .select("id, store_name, open_ai_id, file:file(id, name, size, open_ai_id)")
    .eq("id", vs.id)
    .single();
  if (fullErr) throw fullErr;

  return full;
}

export async function getStoreById(storeId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("vector_store")
    .select("id, store_name, open_ai_id, file:file(id, name, size, open_ai_id)")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function updateStoreName(storeId, storeName) {
  const sb = getSupabaseAdminClient();
  const cleanStoreName = typeof storeName === "string" ? storeName.trim() : "";

  if (!cleanStoreName) {
    throw new Error("Vector store name cannot be empty");
  }

  const { data, error } = await sb
    .from("vector_store")
    .update({ store_name: cleanStoreName })
    .eq("id", storeId)
    .select("id, store_name, open_ai_id")
    .single();

  if (error) throw error;

  return data;
}

export async function deleteStoreById(storeId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb.from("vector_store").delete().eq("id", storeId);
  if (error) throw error;
  return true;
}
