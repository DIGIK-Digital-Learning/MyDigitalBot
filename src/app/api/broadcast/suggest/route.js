import { NextResponse } from "next/server";

import { handleApiError, jsonError, requireOwnedOrg } from "@/lib/auth/guards";
import {
  SUGGESTION_KINDS,
  SUGGESTION_PROMPT_MAX_LENGTH,
  SUGGESTION_TEXT_MAX_LENGTH,
  suggestMessageText,
} from "@/lib/services/broadcast/suggestMessageText";

/**
 * Propõe o texto de uma mensagem com IA. Só o dono da organização pode
 * pedir; nada é enviado nem guardado.
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const auth = await requireOwnedOrg(body?.orgId);
    if (auth.error) return auth.error;

    const kind = SUGGESTION_KINDS.includes(body?.kind) ? body.kind : "message";
    const prompt = String(body?.prompt || "").trim();
    const currentText = String(body?.currentText || "").trim();

    if (!prompt && !currentText) {
      return jsonError("Missing prompt", 400);
    }

    if (
      prompt.length > SUGGESTION_PROMPT_MAX_LENGTH ||
      currentText.length > SUGGESTION_TEXT_MAX_LENGTH * 4
    ) {
      return jsonError("Prompt too long", 400);
    }

    const { data: org } = await auth.admin
      .from("organization")
      .select("name")
      .eq("id", auth.orgId)
      .maybeSingle();

    let suggestion;
    try {
      suggestion = await suggestMessageText({
        organizationName: org?.name || "",
        kind,
        prompt,
        currentText,
      });
    } catch (err) {
      console.error("[Broadcast] text suggestion failed", err?.message);
      return jsonError("Suggestion failed", 502);
    }

    return NextResponse.json(suggestion);
  } catch (err) {
    return handleApiError(err, "Failed to suggest message text");
  }
}
