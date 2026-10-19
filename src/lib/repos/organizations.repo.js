import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
// /lib/repos/organizations.repo.js

export async function createOrganization({
  name,
  ownerUserId,
  channelId,
}) {
  const sb = getSupabaseAdminClient();
  if (!name) {
    throw new Error("Organization name is required");
  }

  if (!ownerUserId) {
    throw new Error("Organization owner is required");
  }

  if (!channelId) {
    throw new Error("Organization channel is required");
  }

  const { data: existingOrganization, error: lookupError } = await sb
    .from("organization")
    .select("id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existingOrganization) {
    const error = new Error(
      "This messaging channel is already assigned to an organization",
    );

    error.status = 409;
    throw error;
  }

  const { data, error } = await sb
    .from("organization")
    .insert([
      {
        name,
        owner_user_id: ownerUserId,
        channel_id: channelId,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getAllOrganization() {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("organization")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function getOrganization(orgId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("organization")
    .select("*")
    .eq("id", orgId)
    .single();

  if (error) throw error;

  return data;
}

export async function getOrganizationByChannelId(channelId) {
  const sb = getRepositoryReadClient();
  if (!channelId) return null;

  const { data, error } = await sb
    .from("organization")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getOrganizationByTeamsTenantId(tenantId) {
  const sb = getRepositoryReadClient();
  const { data, error } = await sb
    .from("organization")
    .select("*")
    .eq("teams_tenant_id", tenantId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getOrganizationBirdConfig(orgId) {
  const sb = getRepositoryReadClient();
  if (!orgId) {
    throw new Error("orgId is required");
  }

  const { data, error } = await sb
    .from("organization")
    .select("id, name, channel_id, waba_id, waba_namespace")
    .eq("id", orgId)
    .single();

  if (error) throw error;

  if (!data) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  if (!data.channel_id) {
    throw new Error(
      `Organization ${orgId} does not have a channel_id configured`,
    );
  }

  return {
    organizationId: data.id,
    organizationName: data.name,
    channelId: data.channel_id,
    wabaId: data.waba_id,
    wabaNamespace: data.waba_namespace,
  };
}
/* =========================================================
   MENSAGEM DE ABERTURA WHATSAPP
   ========================================================= */

export async function getOrganizationOpeningBody(orgId) {
  const sb = getRepositoryReadClient();
  if (!orgId) {
    throw new Error("orgId is required");
  }

  const { data, error } = await sb
    .from("organization")
    .select("whatsapp_opening_body")
    .eq("id", orgId)
    .single();

  if (error) throw error;

  return data?.whatsapp_opening_body ?? null;
}

export async function updateOrganizationOpeningBody(orgId, body) {
  const sb = getSupabaseAdminClient();
  if (!orgId) {
    throw new Error("orgId is required");
  }

  const { data, error } = await sb
    .from("organization")
    .update({ whatsapp_opening_body: body })
    .eq("id", orgId)
    .select("whatsapp_opening_body")
    .single();

  if (error) throw error;

  return data?.whatsapp_opening_body ?? null;
}
