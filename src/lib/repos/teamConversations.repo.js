// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
import { getSupabaseAdminClient } from "@/lib/db/admin";

const sb = getSupabaseAdminClient();

/**
 * Table: user_teams_conversation
 * cols:
 *  - id (bigserial)
 *  - user_id (int4, FK user.id)
 *  - teams_user_id (text)
 *  - conversation_id (text)
 *  - service_url (text)
 *  - tenant_id (text)
 *  - conversation_type (text)
 *  - last_seen_at (timestamptz)
 *
 * UNIQUE (user_id, conversation_type)
 */

export async function upsertUserTeamsConversation({
  userId,
  teamsUserId,
  conversationId,
  serviceUrl,
  tenantId,
  conversationType = "personal",
}) {
  if (!userId || !teamsUserId || !conversationId || !serviceUrl || !tenantId) {
    throw new Error("Missing required fields for upsertUserTeamsConversations");
  }

  const row = {
    user_id: userId,
    teams_user_id: teamsUserId,
    conversation_id: conversationId,
    service_url: serviceUrl,
    tenant_id: tenantId,
    conversation_type: conversationType,
    last_seen_at: new Date().toISOString(),
  };

  const { dataUser, errorUser } = await sb
    .from("user")
    .update({ teams_from_id: teamsUserId })
    .eq("id", userId);

  const { data, error } = await sb
    .from("user_teams_conversation")
    .upsert(row, { onConflict: "user_id, conversation_type" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserTeamsConversation(
  userId,
  conversationType = "personal",
) {
  console.log(`[TEAMS REPO]: ${userId}`);
  const { data, error } = await sb
    .from("user_teams_conversation")
    .select("*")
    .eq("user_id", userId)
    .eq("conversation_type", conversationType)
    .maybeSingle();

  console.log(JSON.parse(data));

  if (error) throw error;
  return data;
}

export async function deleteUserTeamsConversation(
  userId,
  conversation_type = "personal",
) {
  const { error } = await sb
    .from("user_teams_conversation")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_type", conversation_type);

  if (error) throw error;
  return true;
}
