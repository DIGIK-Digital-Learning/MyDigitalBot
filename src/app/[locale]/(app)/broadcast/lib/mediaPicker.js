/*
 * Escolha de ficheiros da multimédia no composer. Os tipos são os mesmos das
 * opções do menu "+": imagem, vídeo e documento.
 */

export function mediaPickerKind(contentType) {
  const type = String(contentType || "");

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "document";

  return null;
}

/**
 * Ficheiros da multimédia do tipo pedido, marcados como "attached" quando já
 * estão na mensagem (comparando pelo URL).
 */
export function mediaForPicker(items = [], kind, attachedUrls = []) {
  const attached = new Set(attachedUrls);

  return items
    .filter((item) => mediaPickerKind(item.contentType) === kind)
    .map((item) => ({ ...item, attached: attached.has(item.url) }));
}

/*
 * Formato dos anexos do composer, igual ao que sai de um upload. O tamanho
 * serve para o limite das imagens no WhatsApp.
 */
export function toComposerFile(item) {
  return {
    url: item.url,
    name: item.name,
    contentType: item.contentType,
    size: item.size,
  };
}
