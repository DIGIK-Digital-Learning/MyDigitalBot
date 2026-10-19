import { getBotToken } from "@/lib/teams/auth";
import { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";
export { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";

/**
 * A member of a Teams conversation as Microsoft sees it (#153): email,
 * login name (UPN) and Microsoft id. Null when it cannot be read.
 */
export async function getTeamsMember({ serviceUrl, conversationId, memberId }) {
  if (!memberId || !conversationId || !isTrustedTeamsServiceUrl(serviceUrl)) {
    return null;
  }

  const token = await getBotToken();
  const base = String(serviceUrl).replace(/\/$/, "");

  const res = await fetch(
    `${base}/v3/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberId)}`,
    { redirect: "error", headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);

  if (!data) return null;

  return {
    email: data.email ?? null,
    userPrincipalName: data.userPrincipalName ?? null,
    aadObjectId: data.aadObjectId ?? null,
  };
}

/**
 * Everyone in a group chat or team where the bot is installed (#165), read
 * page by page. Throws when Teams does not answer, so the caller can tell
 * "no members" apart from "could not read them".
 */
export async function listTeamsConversationMembers({
  serviceUrl,
  conversationId,
}) {
  if (!conversationId || !isTrustedTeamsServiceUrl(serviceUrl)) {
    throw new Error("Untrusted or missing Teams conversation");
  }

  const token = await getBotToken();
  const base = String(serviceUrl).replace(/\/$/, "");
  const members = [];
  let continuationToken = null;

  do {
    const params = new URLSearchParams({ pageSize: "200" });
    if (continuationToken) params.set("continuationToken", continuationToken);

    const res = await fetch(
      `${base}/v3/conversations/${encodeURIComponent(conversationId)}/pagedmembers?${params}`,
      { redirect: "error", headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      throw new Error(`Teams members request failed (${res.status})`);
    }

    const data = await res.json().catch(() => ({}));

    for (const member of Array.isArray(data?.members) ? data.members : []) {
      members.push({
        id: member.id ?? null,
        name: member.name ?? null,
        email: member.email ?? null,
        userPrincipalName: member.userPrincipalName ?? null,
        aadObjectId: member.aadObjectId ?? null,
      });
    }

    continuationToken = data?.continuationToken || null;
  } while (continuationToken);

  return members;
}

/** Name of a team where the bot is installed, or null. */
export async function getTeamName({ serviceUrl, teamId }) {
  if (!teamId || !isTrustedTeamsServiceUrl(serviceUrl)) return null;

  try {
    const token = await getBotToken();
    const base = String(serviceUrl).replace(/\/$/, "");

    const res = await fetch(
      `${base}/v3/teams/${encodeURIComponent(teamId)}`,
      { redirect: "error", headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);

    return data?.name || null;
  } catch {
    return null;
  }
}

/* Email and login name, lower case, without repeats. */
export function memberEmails(member) {
  return [
    ...new Set(
      [member?.email, member?.userPrincipalName]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value.includes("@")),
    ),
  ];
}
