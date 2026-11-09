// Acesso interno privilegiado: processamento de eventos/tarefas, sem sessão de administrador.
require("dotenv").config();
import { getSupabaseAdminClient } from "@/lib/db/admin";

const supabase = getSupabaseAdminClient();

export async function recordWebhookEvent({ provider = "bird", eventKey, eventType, payload }) {
  const { data, error } = await supabase
    .from("webhook_event")
    .upsert(
      { provider, event_key: eventKey, event_type: eventType, payload },
      { onConflict: "provider,event_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return data?.length
    ? { inserted: true, id: data[0].id }
    : { inserted: false, id: null };
}

export async function markWebhookEventProcessing(id) {
  const { data, error: readError } = await supabase
    .from("webhook_event")
    .select("attempts")
    .eq("id", id)
    .single();
  if (readError) throw readError;
  const { error } = await supabase
    .from("webhook_event")
    .update({ status: "processing", attempts: data.attempts + 1 })
    .eq("id", id);
  if (error) throw error;
}

export async function markWebhookEventDone(id) {
  const { error } = await supabase
    .from("webhook_event")
    .update({ status: "done", processed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markWebhookEventFailed(id, message) {
  const { error } = await supabase
    .from("webhook_event")
    .update({
      status: "failed",
      last_error: String(message ?? "").slice(0, 1000),
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
