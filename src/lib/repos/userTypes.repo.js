import { getSupabaseAdminClient } from "@/lib/db/admin";

/*
 * Tipos de utilizador (#247, parte 4/4). Os 3 predefinidos (Administrador,
 * Editor e Leitor) têm organization_id vazio e são iguais para todas; os
 * personalizados pertencem a uma organização. Quem pode o quê decide-se no
 * serviço; aqui só se lê e escreve.
 */

const TYPE_COLUMNS = "id, organization_id, key, name, permissions, is_system, created_at";

function codedError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function toType(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? null,
    key: row.key ?? null,
    name: row.name,
    permissions: row.permissions ?? [],
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  };
}

/* Os predefinidos primeiro, pela ordem Administrador, Editor, Leitor. */
const SYSTEM_ORDER = { admin: 0, editor: 1, viewer: 2 };

/* Os tipos que esta organização pode usar: os predefinidos e os seus. */
export async function listUserTypes(organizationId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_type")
    .select(TYPE_COLUMNS)
    .or(`is_system.eq.true,organization_id.eq.${Number(organizationId)}`)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toType).sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    if (a.isSystem) return (SYSTEM_ORDER[a.key] ?? 9) - (SYSTEM_ORDER[b.key] ?? 9);
    return 0;
  });
}

/* Um tipo, se for predefinido ou desta organização. */
export async function getUserType(organizationId, typeId) {
  const id = Number(typeId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_type")
    .select(TYPE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (!data.is_system && data.organization_id !== Number(organizationId)) return null;
  return toType(data);
}

/* Quantas pessoas da organização têm cada tipo: { [typeId]: n }. */
export async function countMembersByType(organizationId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organization_member")
    .select("user_type_id")
    .eq("organization_id", Number(organizationId));

  if (error) throw error;
  const counts = {};
  for (const row of data ?? []) {
    counts[row.user_type_id] = (counts[row.user_type_id] ?? 0) + 1;
  }
  return counts;
}

export async function countCustomTypes(organizationId) {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("user_type")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", Number(organizationId))
    .eq("is_system", false);

  if (error) throw error;
  return count ?? 0;
}

function mapWriteError(error) {
  /* O nome é único dentro da organização (sem contar maiúsculas). */
  if (error?.code === "23505") return codedError("Name taken", "NAME_TAKEN");
  /* Há pessoas com este tipo (a chave estrangeira não deixa apagar). */
  if (error?.code === "23503") return codedError("Type in use", "TYPE_IN_USE");
  return error;
}

export async function createUserType({ organizationId, name, permissions, createdBy = null }) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_type")
    .insert({
      organization_id: Number(organizationId),
      name,
      permissions,
      is_system: false,
      created_by: createdBy,
    })
    .select(TYPE_COLUMNS)
    .single();

  if (error) throw mapWriteError(error);
  return toType(data);
}

/* Só os personalizados desta organização; os predefinidos não se editam. */
export async function updateUserType(organizationId, typeId, { name, permissions }) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_type")
    .update({ name, permissions })
    .eq("id", Number(typeId))
    .eq("organization_id", Number(organizationId))
    .eq("is_system", false)
    .select(TYPE_COLUMNS)
    .maybeSingle();

  if (error) throw mapWriteError(error);
  return data ? toType(data) : null;
}

export async function deleteUserType(organizationId, typeId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("user_type")
    .delete()
    .eq("id", Number(typeId))
    .eq("organization_id", Number(organizationId))
    .eq("is_system", false);

  if (error) throw mapWriteError(error);
}
