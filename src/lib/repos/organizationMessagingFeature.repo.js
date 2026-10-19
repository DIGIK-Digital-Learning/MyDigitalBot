import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
export async function getOrganizationMessagingFeature({
  organizationId,
  channel = "whatsapp",
}) {
  const sb = getRepositoryReadClient();
  if (!organizationId) {
    throw new Error("organizationId is required");
  }

  const { data, error } = await sb
    .from("organization_messaging_feature")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("channel", channel)
    .maybeSingle();

  if (error) throw error;

  return data ?? null;
}

export async function getOrCreateOrganizationMessagingFeature({
  organizationId,
  channel = "whatsapp",
}) {
  const sb = getSupabaseAdminClient();
  if (!organizationId) {
    throw new Error("organizationId is required");
  }

  const existing = await getOrganizationMessagingFeature({
    organizationId,
    channel,
  });

  if (existing) return existing;

  const { data, error } = await sb
    .from("organization_messaging_feature")
    .insert({
      organization_id: organizationId,
      channel,
      read_chains_enabled: false,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function setReadChainsEnabled({
  organizationId,
  channel = "whatsapp",
  enabled,
}) {
  const sb = getSupabaseAdminClient();
  if (!organizationId) {
    throw new Error("organizationId is required");
  }

  const { data, error } = await sb
    .from("organization_messaging_feature")
    .upsert(
      {
        organization_id: organizationId,
        channel,
        read_chains_enabled: Boolean(enabled),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id,channel",
      },
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

/*
 * One switch covers WhatsApp and Teams chains (#149). It is stored on
 * the WhatsApp row, which is the one the Automations page toggles.
 */
export async function isReadChainsEnabled({ organizationId }) {
  const feature = await getOrganizationMessagingFeature({
    organizationId,
    channel: "whatsapp",
  });

  return Boolean(feature?.read_chains_enabled);
}
