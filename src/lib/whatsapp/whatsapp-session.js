import { getSupabaseAdminClient } from "@/lib/db/admin";

const supabase = getSupabaseAdminClient();

export async function isSessionOpen(userId, hours = 24) {
  const { data, error } = await supabase
    .from("message")
    .select("created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  if (!data?.[0]) return false;

  return (
    Date.now() - new Date(data[0].created_at).getTime() <= hours * 3600 * 1000
  );
}
