import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// /lib/repos/assistants.repo.js

/**
 * Table: assistant
 * cols: id (int4), organization_id (int4), open_ai_id (text), name (text),
 *       description (text), instructions (text), model (text),
 *       top_p (float8), temperature (float8), vector_store_id (int4, nullable),
 *       created_at (timestamp)
 */

export async function createAssistant({
  organizationId,
  name,
  description,
  instructions,
  model,
  top_p,
  temperature,
}) {
  const sb = getSupabaseAdminClient();
  const orgId = Number(organizationId);

  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      `createAssistant received invalid organizationId: ${organizationId}`,
    );
  }

  const { data, error } = await sb
    .from("assistant")
    .insert([
      {
        organization_id: orgId,

        /*
         * New assistants have no OpenAI Assistant ID.
         */
        open_ai_id: null,

        name,
        description: description ?? null,
        instructions: instructions ?? null,
        model,
        top_p: top_p ?? null,
        temperature: temperature ?? null,
        vector_store_id: null,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateAssistant(assistantId, updates) {
  const sb = getSupabaseAdminClient();
  const patch = {};

  const allow = [
    "name",
    "description",
    "instructions",
    "model",
    "top_p",
    "temperature",
    "vector_store_id",
  ];

  for (const key of allow) {
    if (updates[key] !== undefined) {
      patch[key] = updates[key];
    }
  }

  const { data, error } = await sb
    .from("assistant")
    .update(patch)
    .eq("id", assistantId)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getAssistantsInOrg(organizationId) {
  const sb = getRepositoryReadClient();
  const orgId = Number(organizationId);

  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      `getAssistantsInOrg received invalid organizationId: ${organizationId}`,
    );
  }

  const { data, error } = await sb
    .from("assistant")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", {
      ascending: false,
    });

  if (error) throw error;

  return data || [];
}

export async function getAssistantById(id) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("assistant")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function getFirstAssistantInOrg(organizationId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("assistant")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

export async function deleteAssistant(id) {
  const sb = getSupabaseAdminClient();
  // Quem o tinha ativo fica sem ativo ao apagar (a BD põe a null e retira a
  // atribuição); passa a ativo outro dos seus assistentes, se houver (#131).
  const { data: activeUsers, error: usersError } = await sb
    .from("user")
    .select("id")
    .eq("assistant_id", id);
  if (usersError) throw usersError;

  const { error } = await sb.from("assistant").delete().eq("id", id);
  if (error) throw error;

  const userIds = (activeUsers || []).map((u) => u.id);
  if (!userIds.length) return true;

  const { data: remaining, error: remainingError } = await sb
    .from("user_assistant")
    .select("user_id, assistant_id")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });
  if (remainingError) throw remainingError;

  const nextByUser = new Map();
  for (const row of remaining || []) {
    if (!nextByUser.has(row.user_id)) {
      nextByUser.set(row.user_id, row.assistant_id);
    }
  }

  for (const [userId, assistantId] of nextByUser) {
    const { error: promoteError } = await sb
      .from("user")
      .update({ assistant_id: assistantId })
      .eq("id", userId)
      .is("assistant_id", null);
    if (promoteError) throw promoteError;
  }

  return true;
}

export async function associateVectorStoreToDbAssistant(assistantId, storeId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("assistant")
    .update({ vector_store_id: storeId })
    .eq("id", assistantId);
  if (error) throw error;
  return true;
}

export async function nullifyVectorStoreToDbAssistant(assistantId) {
  const sb = getSupabaseAdminClient();
  const { error } = await sb
    .from("assistant")
    .update({ vector_store_id: null })
    .eq("id", assistantId);
  if (error) throw error;
  return true;
}
