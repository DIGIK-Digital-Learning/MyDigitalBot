/*
 * A organização de quem tem a sessão, lida com o cliente da sessão (browser
 * ou servidor), sob as regras RLS (#247).
 *
 * Uma conta pertence a uma só organização: a da sua linha em
 * `organization_member`. Sem essa linha (a migração ainda não correu), cai
 * para a organização de que é dono, como antes.
 *
 * Devolve `{ data, error }`, como o cliente Supabase.
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export async function fetchCurrentOrganization(supabase, userId, columns) {
  const { data: member, error: memberError } = await supabase
    .from("organization_member")
    .select("organization_id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (memberError && !MISSING_TABLE_CODES.has(memberError.code)) {
    return { data: null, error: memberError };
  }

  const query = supabase.from("organization").select(columns);

  return member?.organization_id
    ? query.eq("id", member.organization_id).maybeSingle()
    : query.eq("owner_user_id", userId).order("id").limit(1).maybeSingle();
}
