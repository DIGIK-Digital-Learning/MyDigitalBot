// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
import { getSupabaseAdminClient } from "@/lib/db/admin";

const sb = getSupabaseAdminClient();

export async function upsertTeamsInstallation(row) {
  console.log("It reached here");
  const { data, error } = await sb
    .from("teams_installation")
    .upsert(row, { onConflict: "tenant_id,conversation_id" })
    .select()
    .single();

  console.log(data);

  if (error) throw error;
  return data;
}

export async function getTeamsInstallationByConversation({
  tenantId,
  conversationId,
}) {
  const { data, error } = await sb
    .from("teams_installation")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/*
 * Num canal, cada publicação tem a conversa "<canal>;messageid=<id>", e as
 * mensagens podem vir de outros canais da mesma equipa. Procura o grupo pela
 * conversa exata, depois pelo canal e por fim pela equipa (#164).
 */
export function baseTeamsConversationId(conversationId) {
  return String(conversationId || "").split(";")[0];
}

export async function getGroupInstallationForConversation({
  tenantId,
  conversationId,
  teamId = null,
}) {
  const candidates = [
    ...new Set([conversationId, baseTeamsConversationId(conversationId)]),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const found = await getTeamsInstallationByConversation({
      tenantId,
      conversationId: candidate,
    });

    if (found) return found;
  }

  if (!teamId) return null;

  const { data, error } = await sb
    .from("teams_installation")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("scope", "group")
    .eq("team_id", teamId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* Grupos da organização com estes ids, ativos ou não (#166). */
export async function getGroupInstallationsByIds({ organizationId, ids }) {
  if (!organizationId || !ids?.length) return [];

  const { data, error } = await sb
    .from("teams_installation")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scope", "group")
    .in("id", ids);

  if (error) throw error;
  return data ?? [];
}

/* O bot saiu do grupo: deixa de aparecer como destino de mensagens. */
export async function deactivateGroupInstallation({ tenantId, conversationId }) {
  const { error } = await sb
    .from("teams_installation")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("scope", "group");

  if (error) throw error;
}

export async function getTeamsUserInstallation({
  userId,
  organizationId,
  conversationType = "personal",
}) {
  if (!organizationId) return null;

  const { data, error } = await sb
    .from("teams_installation")
    .select("*")
    .eq("scope", "user")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("conversation_type", conversationType)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/*
 * Personal installations of people the bot could not match to a
 * platform user yet (#153). They get a user when the admin adds
 * someone with the same Microsoft email.
 */
export async function getPendingTeamsUserInstallations(
  organizationId,
  limit = 50,
) {
  if (!organizationId) return [];

  const { data, error } = await sb
    .from("teams_installation")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("scope", "user")
    .eq("conversation_type", "personal")
    .eq("is_active", true)
    .is("user_id", null)
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}
