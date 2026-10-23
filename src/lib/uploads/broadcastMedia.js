export const BROADCAST_MEDIA_BUCKET = "broadcast-media";

// Antes da #160 a multimédia ia para o bucket images. Esses ficheiros ficam lá
// e continuam a aparecer na página de multimédia.
export const LEGACY_BROADCAST_BUCKET = "images";

export const BROADCAST_MEDIA_BUCKETS = [
  BROADCAST_MEDIA_BUCKET,
  LEGACY_BROADCAST_BUCKET,
];

// Iguais aos do bucket (50 MB desde 20261021120000_broadcast_media_50mb.sql,
// o máximo do plano Free do Supabase).
export const BROADCAST_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

// O WhatsApp só aceita imagens até 5 MB. Vídeos e PDF ficam no limite do bucket.
export const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const BROADCAST_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const BROADCAST_MEDIA_TYPES = [
  ...BROADCAST_IMAGE_TYPES,
  "application/pdf",
  "video/mp4",
];

// Valor do accept do input de ficheiros para cada opção do menu "+".
export const BROADCAST_MEDIA_ACCEPT = {
  image: BROADCAST_IMAGE_TYPES.join(","),
  video: "video/mp4",
  document: "application/pdf",
};

function makeSafeName(name) {
  const safe = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "file";
}

/**
 * Pasta da organização nos buckets de multimédia. Fica na segunda posição
 * porque a policy só deixa escrever em broadcasts/<organização de que és owner>/.
 */
export function broadcastMediaFolder(orgId) {
  const org = String(orgId ?? "").trim();
  if (!/^[a-zA-Z0-9-]+$/.test(org)) {
    throw new Error("Organização em falta para o upload.");
  }
  return `broadcasts/${org}`;
}

export function buildBroadcastMediaKey(orgId, fileName) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${broadcastMediaFolder(orgId)}/${unique}-${makeSafeName(fileName)}`;
}

/**
 * Motivo para recusar o ficheiro antes do upload, ou null se pode subir.
 * O bucket recusa na mesma, isto só evita o erro genérico do Storage.
 */
export function broadcastMediaRejection(contentType, size) {
  if (!BROADCAST_MEDIA_TYPES.includes(contentType)) return "type";
  if (Number(size) > BROADCAST_MEDIA_MAX_BYTES) return "size";
  return null;
}

/**
 * Imagem grande demais para o WhatsApp. Ficheiros sem tamanho conhecido
 * (anexos de antes de guardarmos o tamanho) não são bloqueados.
 */
export function isWhatsappImageTooLarge(file) {
  return (
    BROADCAST_IMAGE_TYPES.includes(file?.contentType) &&
    Number(file?.size) > WHATSAPP_IMAGE_MAX_BYTES
  );
}
