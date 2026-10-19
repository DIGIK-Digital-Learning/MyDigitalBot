import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// src/lib/repos/user.repo.js

import { resolveAssistantAssignment } from "@/lib/services/users/assistantAssignment";

function cleanMsisdn(n) {
  return String(n).replace(/\D/g, "");
}

function cleanText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const str = String(value).trim();
  return str.length ? str : null;
}

function cleanUsername(value) {
  const str = cleanText(value);
  return str ? str.toLowerCase() : str;
}

function sameNullableNumber(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
}

async function cancelPendingInactivityRunsForAssistantChange(
  userId,
  nextAssistantId,
) {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("automation_run")
    .update({
      status: "cancelled",
      last_error: "Cancelled because the user's assistant changed",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("trigger_type", "user.inactive")
    .in("status", ["queued", "materialized"]);

  if (nextAssistantId == null) {
    // cancel all pending inactivity runs for this user
  } else {
    query = query.neq("assistant_id", nextAssistantId);
  }

  const { error } = await query;
  if (error) throw error;
}

// Deixa em user_assistant exatamente os assistentes pedidos (#131).
async function setUserAssistants(userId, assistantIds) {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: exErr } = await supabase
    .from("user_assistant")
    .select("assistant_id")
    .eq("user_id", userId);

  if (exErr) throw exErr;

  const have = new Set((existing || []).map((r) => Number(r.assistant_id)));
  const want = new Set(assistantIds.map(Number));

  const toInsert = [...want].filter((id) => !have.has(id));
  const toDelete = [...have].filter((id) => !want.has(id));

  if (toInsert.length) {
    const rows = toInsert.map((assistantId) => ({
      user_id: userId,
      assistant_id: assistantId,
    }));
    const { error: insErr } = await supabase
      .from("user_assistant")
      .upsert(rows, { onConflict: "user_id,assistant_id" });
    if (insErr) throw insErr;
  }

  if (toDelete.length) {
    const { error: delErr } = await supabase
      .from("user_assistant")
      .delete()
      .eq("user_id", userId)
      .in("assistant_id", toDelete);
    if (delErr) throw delErr;
  }
}

export async function createUser({
  organizationId,
  phoneNumber,
  phoneCountryCode,
  phoneNational,
  name,
  email = null,
  assistantId,
  assistantIds,
  teamsAadObjectId,
  teamsFromId,
  whatsappBsuid,
  whatsappUsername,
  birdContactId,
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_user_with_plan_limit", {
    p_organization_id: organizationId,
    p_phone_number: phoneNumber ?? null,
    p_name: name ?? null,
    p_assistant_id: assistantId ?? null,
    p_email: email ?? null,
    p_teams_aad_object_id: teamsAadObjectId ?? null,
    p_teams_from_id: teamsFromId ?? null,
    p_phone_country_code: phoneCountryCode ?? null,
    p_phone_national: phoneNational ?? null,
  });

  if (error) {
    if (error.message?.includes("User limit reached")) {
      const err = new Error("User limit reached for this organization");
      err.code = "USER_LIMIT_REACHED";
      throw err;
    }
    throw error;
  }

  const created = Array.isArray(data) ? data[0] : data;

  // O ativo já ficou atribuído pelo trigger; aqui entram os restantes.
  if (Array.isArray(assistantIds) && assistantIds.length) {
    await setUserAssistants(
      created.id,
      assistantId == null ? assistantIds : [...assistantIds, assistantId],
    );
  }

  if (whatsappBsuid || whatsappUsername || birdContactId) {
    return await updateUserWhatsappIdentity(created.id, {
      whatsappBsuid,
      whatsappUsername,
      birdContactId,
    });
  }

  return await getUserById(created.id);
}

export async function deleteUser(userId) {
  const supabase = getSupabaseAdminClient();
  await supabase.from("user_tag").delete().eq("user_id", userId).throwOnError();

  const { data: threads } = await supabase
    .from("thread")
    .select("id")
    .eq("user_id", userId);

  const threadIds = (threads || []).map((t) => t.id);
  if (threadIds.length) {
    await supabase
      .from("message")
      .delete()
      .in("thread_id", threadIds)
      .throwOnError?.();

    await supabase.from("thread").delete().in("id", threadIds).throwOnError?.();
  }

  await supabase.from("pending_outreach").delete().eq("user_id", userId);

  const { error } = await supabase.from("user").delete().eq("id", userId);
  if (error) throw error;
  return true;
}

export async function updateUser(userId, updates) {
  const supabase = getSupabaseAdminClient();
  const currentUser = await getUserById(userId);
  if (!currentUser) {
    throw new Error("User not found");
  }

  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;

  const assignment = resolveAssistantAssignment({
    currentIds: currentUser.assistant_ids,
    currentActiveId: currentUser.assistant_id,
    assistantIds: updates.assistantIds,
    assistantId: updates.assistantId,
  });

  if (assignment) {
    patch.assistant_id = assignment.activeId;
  }

  if (updates.phoneNumber !== undefined) {
    patch.phone_number =
      updates.phoneNumber === null ? null : String(updates.phoneNumber).trim();
  }

  if (updates.phoneCountryCode !== undefined) {
    patch.phone_country_code =
      updates.phoneCountryCode === null
        ? null
        : String(updates.phoneCountryCode).trim();
  }

  if (updates.phoneNational !== undefined) {
    const digits = cleanMsisdn(updates.phoneNational);
    patch.phone_national = digits || null;
  }

  if (updates.teamsAadObjectId !== undefined) {
    patch.teams_aad_object_id =
      updates.teamsAadObjectId === null
        ? null
        : String(updates.teamsAadObjectId).trim();
  }

  if (updates.teamsFromId !== undefined) {
    patch.teams_from_id =
      updates.teamsFromId === null ? null : String(updates.teamsFromId).trim();
  }

  if (updates.whatsappBsuid !== undefined) {
    patch.whatsapp_bsuid = cleanText(updates.whatsappBsuid);
  }

  if (updates.whatsappUsername !== undefined) {
    patch.whatsapp_username = cleanUsername(updates.whatsappUsername);
  }

  if (updates.birdContactId !== undefined) {
    patch.bird_contact_id = cleanText(updates.birdContactId);
  }

  if (
    updates.whatsappBsuid !== undefined ||
    updates.whatsappUsername !== undefined ||
    updates.birdContactId !== undefined
  ) {
    patch.whatsapp_identity_updated_at = new Date().toISOString();
  }

  if (Object.keys(patch).length) {
    const { error: upErr } = await supabase
      .from("user")
      .update(patch)
      .eq("id", userId);

    if (upErr) throw upErr;
  }

  if (Array.isArray(updates.tagIds)) {
    const { data: existing, error: exErr } = await supabase
      .from("user_tag")
      .select("tag_id")
      .eq("user_id", userId);

    if (exErr) throw exErr;

    const have = new Set((existing || []).map((r) => r.tag_id));
    const want = new Set(updates.tagIds.map((n) => Number(n)));

    const toInsert = [...want].filter((id) => !have.has(id));
    const toDelete = [...have].filter((id) => !want.has(id));

    if (toInsert.length) {
      const rows = toInsert.map((tagId) => ({
        user_id: userId,
        tag_id: tagId,
      }));
      const { error: insErr } = await supabase.from("user_tag").insert(rows);
      if (insErr) throw insErr;
    }

    if (toDelete.length) {
      const { error: delErr } = await supabase
        .from("user_tag")
        .delete()
        .eq("user_id", userId)
        .in("tag_id", toDelete);

      if (delErr) throw delErr;
    }
  }

  // Depois de gravar o ativo, para o trigger não repor um que foi retirado.
  if (assignment) {
    await setUserAssistants(userId, assignment.ids);
  }

  const nextAssistantId = assignment
    ? assignment.activeId
    : (currentUser.assistant_id ?? null);

  const assistantChanged =
    Boolean(assignment) &&
    !sameNullableNumber(currentUser.assistant_id, nextAssistantId);

  if (assistantChanged) {
    await cancelPendingInactivityRunsForAssistantChange(
      userId,
      nextAssistantId,
    );
  }

  return await getUserById(userId);
}

// Último menu de troca de assistente enviado ao contacto (#132).
export async function setUserAssistantMenu(userId, { messageId, sentAt }) {
  const supabase = getSupabaseAdminClient();
  const patch = { assistant_menu_sent_at: sentAt ?? null };
  if (messageId !== undefined) patch.assistant_menu_message_id = messageId;

  const { error } = await supabase.from("user").update(patch).eq("id", userId);
  if (error) throw error;
}

export async function updateUserWhatsappIdentity(
  userId,
  { whatsappBsuid, whatsappUsername, birdContactId } = {},
) {
  const supabase = getSupabaseAdminClient();
  if (!userId) return null;

  const current = await getUserById(userId);
  if (!current) return null;

  const patch = {};

  const nextWhatsappBsuid = cleanText(whatsappBsuid);
  const nextWhatsappUsername = cleanUsername(whatsappUsername);
  const nextBirdContactId = cleanText(birdContactId);

  if (
    nextWhatsappBsuid &&
    nextWhatsappBsuid !== cleanText(current.whatsapp_bsuid)
  ) {
    patch.whatsapp_bsuid = nextWhatsappBsuid;
  }

  if (
    nextWhatsappUsername &&
    nextWhatsappUsername !== cleanUsername(current.whatsapp_username)
  ) {
    patch.whatsapp_username = nextWhatsappUsername;
  }

  if (
    nextBirdContactId &&
    nextBirdContactId !== cleanText(current.bird_contact_id)
  ) {
    patch.bird_contact_id = nextBirdContactId;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  patch.whatsapp_identity_updated_at = new Date().toISOString();

  const { error } = await supabase.from("user").update(patch).eq("id", userId);

  if (error) throw error;

  return await getUserById(userId);
}

export async function getUserById(userId) {
  const supabase = getRepositoryReadClient();
  const { data, error } = await supabase
    .from("user")
    .select(
      `
      id,
      organization_id,
      phone_number,
      phone_country_code,
      phone_national,
      whatsapp_bsuid,
      whatsapp_username,
      bird_contact_id, 
      whatsapp_identity_updated_at,
      name,
      email,
      teams_aad_object_id,
      assistant_id,
      assistant_menu_message_id,
      assistant_menu_sent_at,
      created_at,
      user_tag:user_tag (
        tag:tags ( id, name, slug, color )
      ),
      user_assistant:user_assistant ( assistant_id )
    `,
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const tags = (data.user_tag || []).map((ut) => ut.tag).filter(Boolean);

  return {
    id: data.id,
    organization_id: data.organization_id,
    phone_number: data.phone_number,
    phone_country_code: data.phone_country_code,
    phone_national: data.phone_national,
    whatsapp_bsuid: data.whatsapp_bsuid,
    whatsapp_username: data.whatsapp_username,
    bird_contact_id: data.bird_contact_id,
    name: data.name,
    email: data.email,
    teams_aad_object_id: data.teams_aad_object_id ?? null,
    assistant_id: data.assistant_id,
    assistant_ids: (data.user_assistant || []).map((ua) => ua.assistant_id),
    assistant_menu_message_id: data.assistant_menu_message_id,
    assistant_menu_sent_at: data.assistant_menu_sent_at,
    created_at: data.created_at,
    tags,
    tag_ids: tags.map((t) => t.id),
    tag_names: tags.map((t) => t.name),
  };
}

async function getSingleUserByIdentity({ column, value, organizationId }) {
  const supabase = getRepositoryReadClient();
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  let query = supabase.from("user").select("id").eq(column, cleaned);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;
  if (!data?.length) return null;

  if (!organizationId && data.length > 1) {
    console.warn(
      `Multiple users match ${column}; pass organizationId to disambiguate`,
      {
        column,
        count: data.length,
      },
    );

    return null;
  }

  return await getUserById(data[0].id);
}

export async function getUserByWhatsappBsuid(
  whatsappBsuid,
  organizationId = null,
) {
  return await getSingleUserByIdentity({
    column: "whatsapp_bsuid",
    value: whatsappBsuid,
    organizationId,
  });
}

export async function getUserByBirdContactId(
  birdContactId,
  organizationId = null,
) {
  return await getSingleUserByIdentity({
    column: "bird_contact_id",
    value: birdContactId,
    organizationId,
  });
}

export async function getUserByNumber(
  phoneNumber,
  organizationId,
) {
  const supabase = getRepositoryReadClient();
  const digits = cleanMsisdn(phoneNumber);

  if (!digits || !organizationId) {
    return null;
  }

  let { data, error } = await supabase
    .from("user")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_national", digits)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return await getUserById(data.id);
  }

  const legacy = await supabase
    .from("user")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone_number", digits)
    .maybeSingle();

  if (legacy.error) throw legacy.error;

  if (legacy.data) {
    return await getUserById(legacy.data.id);
  }

  const alt = await supabase
    .from("user")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("phone_number", `%${digits}`)
    .maybeSingle();

  if (alt.error) throw alt.error;

  return alt.data
    ? await getUserById(alt.data.id)
    : null;
}

export async function getUserByEmail(email, tenant) {
  const supabase = getRepositoryReadClient();
  const _email = String(email || "")
    .trim()
    .toLowerCase();

  if (!_email || !tenant) return null;

  const { data, error } = await supabase
    .from("user")
    .select("id, organization:organization_id (id, teams_tenant_id)")
    .ilike("email", _email);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const matches = data.filter(
    (r) => r.organization?.teams_tenant_id === tenant,
  );

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    const err = new Error("Multiple users match this email in this tenant");
    err.code = "AMBIGUOUS_EMAIL_TENANT";
    throw err;
  }

  return matches[0].id;
}

export async function getUsersInOrg(orgId, { page = 1, pageSize = 100 } = {}) {
  const supabase = getRepositoryReadClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("user")
    .select(
      `
      id,
      name,
      phone_number,
      phone_country_code,
      phone_national,
      whatsapp_bsuid,
      whatsapp_username,
      bird_contact_id,
      whatsapp_identity_updated_at,
      email,
      assistant_id,
      teams_aad_object_id,
      teams_from_id,
      created_at,
      user_tag:user_tag (
        tag:tags ( id, name, slug, color )
      ),
      user_assistant:user_assistant ( assistant_id )
      `,
      { count: "exact" },
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const items = (data || []).map((u) => {
    const tags = (u.user_tag || []).map((ut) => ut.tag).filter(Boolean);

    return {
      id: u.id,
      name: u.name,
      phone_number: u.phone_number,
      phone_country_code: u.phone_country_code,
      phone_national: u.phone_national,
      whatsapp_bsuid: u.whatsapp_bsuid,
      whatsapp_username: u.whatsapp_username,
      bird_contact_id: u.bird_contact_id,
      whatsapp_identity_updated_at: u.whatsapp_identity_updated_at,
      email: u.email,
      assistant_id: u.assistant_id,
      assistant_ids: (u.user_assistant || []).map((ua) => ua.assistant_id),
      teams_aad_object_id: u.teams_aad_object_id,
      teams_from_id: u.teams_from_id,
      created_at: u.created_at,
      tags,
      tag_ids: tags.map((t) => t.id),
      tag_names: tags.map((t) => t.name),
    };
  });

  return {
    items,
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getUserByAadObjectId(aadObjectId) {
  const supabase = getRepositoryReadClient();
  if (!aadObjectId) return null;

  const { data, error } = await supabase
    .from("user")
    .select("*")
    .eq("teams_aad_object_id", aadObjectId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
