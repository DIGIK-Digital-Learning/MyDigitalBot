/* Chamadas HTTP da página de envio. */

export async function fetchTrackedLinkLibrary(orgId) {
  const res = await fetch(
    `/api/tracked-links/library?orgId=${encodeURIComponent(orgId)}`,
    { cache: "no-store" },
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Could not load tracked links");
  }

  return Array.isArray(data?.items) ? data.items : [];
}

/*
 * Elimina um link da biblioteca (#189). Devolve a resposta do servidor:
 * `{ ok: true }` ou `{ code: "TRACKED_LINK_IN_USE", reason }` quando o link
 * ainda está numa agendada ou numa corrente.
 */
export async function deleteTrackedLinkFromLibrary(orgId, id) {
  const res = await fetch(
    `/api/tracked-links/library?orgId=${encodeURIComponent(orgId)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  const data = await res.json().catch(() => ({}));

  if (!res.ok && data?.code !== "TRACKED_LINK_IN_USE") {
    throw new Error(data?.error || "Could not delete tracked link");
  }

  return data;
}

/* Pede uma imagem à IA; devolve `{ image, contentType }` (image em base64). */
export async function requestBroadcastImage({ orgId, prompt }) {
  const res = await fetch("/api/broadcast/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, prompt }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.image) {
    throw new Error(data?.error || "Image generation failed");
  }

  return { image: data.image, contentType: data.contentType || "image/jpeg" };
}
