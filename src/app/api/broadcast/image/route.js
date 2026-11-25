import { NextResponse } from "next/server";

import { handleApiError, jsonError, requireOwnedOrg } from "@/lib/auth/guards";
import {
  IMAGE_PROMPT_MAX_LENGTH,
  generateBroadcastImage,
} from "@/lib/services/broadcast/generateBroadcastImage";

/* Gerar uma imagem demora: dá-lhe até 2 minutos na Vercel. */
export const maxDuration = 120;

/**
 * Gera uma imagem com IA para a mensagem. Só o dono da organização pode
 * pedir; nada é enviado nem guardado (a imagem só é guardada se for usada).
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));

    const auth = await requireOwnedOrg(body?.orgId);
    if (auth.error) return auth.error;

    const prompt = String(body?.prompt || "").trim();

    if (!prompt) {
      return jsonError("Missing prompt", 400);
    }

    if (prompt.length > IMAGE_PROMPT_MAX_LENGTH) {
      return jsonError("Prompt too long", 400);
    }

    let result;
    try {
      result = await generateBroadcastImage({ prompt });
    } catch (err) {
      console.error("[Broadcast] image generation failed", err?.message);
      return jsonError("Image generation failed", 502);
    }

    /* Tokens gastos por imagem, para se saber o custo real. */
    console.info("[Broadcast] image generated", {
      orgId: auth.orgId,
      usage: result.usage,
    });

    return NextResponse.json({
      image: result.image,
      contentType: result.contentType,
    });
  } catch (err) {
    return handleApiError(err, "Failed to generate image");
  }
}
