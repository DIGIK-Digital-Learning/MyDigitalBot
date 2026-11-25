import { getSupabaseAdminClient } from "@/lib/db/admin";

/*
 * Contas da Equipa de uma organização (#247, parte 3/4). Quem pode o quê
 * decide-se nas rotas; aqui só se lê e escreve, sempre com o cliente de
 * servidor, porque o auth.users não está exposto na API.
 */

const MEMBER_COLUMNS =
  "id, organization_id, auth_user_id, user_type_id, invited_by, created_at, user_type ( key, name, is_system, permissions )";

function codedError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function flattenType(row) {
  const type = Array.isArray(row.user_type) ? row.user_type[0] : row.user_type;
  return {
    id: row.id,
    organizationId: row.organization_id,
    authUserId: row.auth_user_id,
    userTypeId: row.user_type_id,
    typeKey: type?.key ?? null,
    typeName: type?.name ?? null,
    typePermissions: type?.permissions ?? [],
    invitedBy: row.invited_by ?? null,
    createdAt: row.created_at,
  };
}

export async function listMembers(organizationId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organization_member")
    .select(MEMBER_COLUMNS)
    .eq("organization_id", Number(organizationId))
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(flattenType);
}

export async function getMember(organizationId, memberId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organization_member")
    .select(MEMBER_COLUMNS)
    .eq("organization_id", Number(organizationId))
    .eq("id", Number(memberId))
    .maybeSingle();

  if (error) throw error;
  return data ? flattenType(data) : null;
}

export async function getMemberByAuthUser(authUserId) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organization_member")
    .select(MEMBER_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  return data ? flattenType(data) : null;
}

export async function countMembers(organizationId) {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("organization_member")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", Number(organizationId));

  if (error) throw error;
  return count ?? 0;
}

/* Tipos de sistema (Administrador, Editor, Leitor) por chave. */
export async function getSystemUserType(key) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_type")
    .select("id, key, name")
    .eq("is_system", true)
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findAuthUserIdByEmail(email) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("auth_user_id_by_email", {
    p_email: email,
  });

  if (error) throw error;
  return data ?? null;
}

/*
 * Acrescenta a conta à Equipa. Quem recusa é a base de dados
 * (add_org_member_with_limits), com a organização bloqueada, para dois
 * convites ao mesmo tempo não ficarem os dois com o último lugar.
 */
export async function addMemberWithLimits({
  organizationId,
  authUserId,
  userTypeId,
  invitedBy = null,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("add_org_member_with_limits", {
    p_organization_id: Number(organizationId),
    p_auth_user_id: authUserId,
    p_user_type_id: userTypeId,
    p_invited_by: invitedBy,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("Team limit reached")) {
      throw codedError("Team limit reached", "TEAM_LIMIT_REACHED");
    }
    if (message.includes("User limit reached")) {
      throw codedError("User limit reached", "USER_LIMIT_REACHED");
    }
    if (error.code === "23505") {
      throw codedError("Already a member", "ALREADY_MEMBER");
    }
    throw error;
  }

  return Array.isArray(data) ? data[0] : data;
}

export async function updateMemberType(organizationId, memberId, userTypeId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("organization_member")
    .update({ user_type_id: userTypeId })
    .eq("organization_id", Number(organizationId))
    .eq("id", Number(memberId));

  if (error) throw error;
}

/*
 * Cada pessoa só está numa organização, por isso a conta só existe para
 * esta Equipa: tirá-la da Equipa apaga a conta (a linha de membro vai com
 * ela, por cascata). Voltar a convidar o mesmo email cria uma conta nova.
 */
export async function deleteMemberAccount(authUserId) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(authUserId);
  if (error) throw error;
}

/* Email, convite e última entrada de cada conta, para a lista da Equipa. */
export async function getAuthUsersInfo(authUserIds = []) {
  const supabase = getSupabaseAdminClient();
  const entries = await Promise.all(
    authUserIds.map(async (id) => {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      if (error || !data?.user) return [id, null];
      const user = data.user;
      return [
        id,
        {
          email: user.email ?? null,
          invitedAt: user.invited_at ?? null,
          lastSignInAt: user.last_sign_in_at ?? null,
        },
      ];
    }),
  );
  return Object.fromEntries(entries);
}

/* Manda o email do convite; devolve o id da conta nova. */
export async function inviteAuthUser(email, { redirectTo, data = {} } = {}) {
  const supabase = getSupabaseAdminClient();
  const { data: result, error } = await supabase.auth.admin.inviteUserByEmail(
    email,
    { redirectTo, data },
  );

  if (error) throw error;
  return result?.user?.id ?? null;
}
