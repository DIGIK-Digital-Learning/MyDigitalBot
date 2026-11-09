import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import { getOrganizationLogoUrl } from "@/lib/helpers/organizationLogo.helpers";

export const ORGANIZATION_SETTINGS_COLUMNS = [
  "id",
  "name",
  "default_phone_country_code",
  "theme",
  "logo_url",
  "favicon_url",
  "teams_tenant_id",
  "waba_id",
  "waba_namespace",
].join(", ");

export async function getOrganizationSettings(orgId) {
  const admin = getRepositoryReadClient();
  const { data, error } = await admin
    .from("organization")
    .select(ORGANIZATION_SETTINGS_COLUMNS)
    .eq("id", orgId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateOrganizationSettings(orgId, patch) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("organization")
    .update(patch)
    .eq("id", orgId)
    .select(ORGANIZATION_SETTINGS_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function uploadOrganizationLogo({ path, bytes, contentType }) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.storage.from("images").upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) throw error;

  return path;
}

/**
 * Reads an uploaded logo from the public bucket. Returns null when the object
 * does not exist (Storage answers 400 with a "404" body for missing keys).
 */
export async function downloadOrganizationLogo(path) {
  const response = await fetch(getOrganizationLogoUrl(path), {
    cache: "no-store",
  });

  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Logo download failed with status ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function removeOrganizationLogo(path) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.storage.from("images").remove([path]);

  if (error) throw error;
}

export async function updateOrganizationLogo(orgId, logoUrl) {
  return updateOrganizationSettings(orgId, { logo_url: logoUrl });
}
