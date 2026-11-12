import sharp from "sharp";

import { openai } from "@/lib/openai/client";
import { AI_MODELS } from "@/lib/openai/models";

export const IMAGE_PROMPT_MAX_LENGTH = 600;

/* O WhatsApp aceita imagens JPEG ou PNG até 5 MB. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/*
 * O modelo de imagem está em src/lib/openai/models.js (#250). Qualidade
 * média em 1024x1024: num telemóvel não se nota a diferença para a alta, e
 * sai mais rápido e mais barato.
 */
const IMAGE_SIZE = "1024x1024";
const IMAGE_QUALITY = "medium";

/* Qualidades JPEG a tentar, da melhor para a mais leve, até caber nos 5 MB. */
const JPEG_QUALITIES = [85, 70, 55];

/*
 * O modelo de imagem só recebe um texto: as regras vão à frente do pedido.
 * Estes modelos ainda erram letras, por isso a imagem só leva texto escrito
 * quando o pedido o pede.
 */
function buildPrompt(request) {
  return [
    "Imagem para uma mensagem que uma organização envia aos seus colaboradores por WhatsApp ou Teams.",
    "Sem texto escrito na imagem, a não ser que o pedido o peça; nesse caso, em português de Portugal e curto.",
    "Estilo limpo e profissional, adequado a um contexto de trabalho.",
    `Pedido: ${request}`,
  ].join("\n");
}

/*
 * Garante o que o WhatsApp aceita: JPEG e até 5 MB. Converte sempre, mesmo
 * que a OpenAI já tenha mandado JPEG, para não depender do que ela devolve.
 */
async function toWhatsappJpeg(input) {
  for (const quality of JPEG_QUALITIES) {
    const output = await sharp(input).jpeg({ quality }).toBuffer();
    if (output.length <= IMAGE_MAX_BYTES) return output;
  }

  throw new Error("A imagem ficou maior do que o WhatsApp aceita.");
}

/**
 * Gera uma imagem a partir do pedido do administrador. Nada fica guardado:
 * devolve a imagem em base64 para o browser a mostrar como proposta, e só é
 * guardada se for usada. `usage` diz quantos tokens gastou (para os custos).
 */
export async function generateBroadcastImage({ prompt = "", deps = {} }) {
  const client = deps.openai || openai;
  const request = String(prompt || "").trim();

  if (!request) {
    throw new Error("Falta o pedido da imagem.");
  }

  const response = await client.images.generate(
    {
      model: AI_MODELS.image,
      prompt: buildPrompt(request),
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
      output_format: "jpeg",
      n: 1,
    },
    { timeout: 110000, maxRetries: 0 },
  );

  const base64 = response?.data?.[0]?.b64_json;
  if (!base64) {
    throw new Error("A imagem não foi gerada.");
  }

  const jpeg = await toWhatsappJpeg(Buffer.from(base64, "base64"));

  return {
    image: jpeg.toString("base64"),
    contentType: "image/jpeg",
    usage: response.usage || null,
  };
}
