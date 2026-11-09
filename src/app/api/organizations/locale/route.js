export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { handleApiError, requireOwnedOrg } from "@/lib/auth/guards";
import { updateOrganizationLocale } from "@/lib/repos/organizations.repo";

const LOCALES = new Set(["pt", "en"]);

/*
 * Guarda a língua escolhida no topo do site na organização. Serve aos avisos
 * que o servidor manda aos colaboradores (limite semanal), que saem sem
 * ninguém com o site aberto.
 */
export async function PATCH(req) {
  try {
    const body = await req.json().catch(() => ({}));

    if (!LOCALES.has(body?.locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }

    const orgAuth = await requireOwnedOrg(body?.orgId);
    if (orgAuth.error) return orgAuth.error;

    await updateOrganizationLocale(orgAuth.orgId, body.locale);

    return NextResponse.json({ ok: true, locale: body.locale });
  } catch (err) {
    return handleApiError(err, "Failed to save organization language");
  }
}
