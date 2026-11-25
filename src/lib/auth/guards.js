import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

import createSupabaseServerClient from "@/utils/supabase/server";
import { getSupabaseAdminClient } from "@/lib/db/admin";

export function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json(
    {
      error: message,
      ...extra,
    },
    {
      status,
    },
  );
}

export function parsePositiveInt(value) {
  const n = Number(value);

  return Number.isInteger(n) && n > 0 ? n : null;
}

export function cleanPatch(input = {}, allowed = []) {
  return Object.fromEntries(
    Object.entries(input || {}).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined,
    ),
  );
}

export function getHttpStatus(error, fallback = 500) {
  const status = Number(error?.status || error?.statusCode);

  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : fallback;
}

export function handleApiError(error, fallbackMessage = "Request failed") {
  const status = getHttpStatus(error);

  const message =
    status >= 500 ? fallbackMessage : error?.message || fallbackMessage;

  if (status >= 500) {
    console.error("[API]", error);
  }

  return jsonError(message, status);
}

export function throwHttpError(message, status = 400) {
  const error = new Error(message);

  error.status = status;

  throw error;
}

/* =========================================================
   AUTHENTICATED USER
   ========================================================= */

export async function requireUser() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: jsonError("Unauthorized", 401),
    };
  }

  return {
    user,
    supabase,
    admin: getSupabaseAdminClient(),
  };
}

/* =========================================================
   ORGANIZATION
   ========================================================= */

async function authorizeOwnedOrg(auth, orgId) {
  const parsedOrgId = parsePositiveInt(orgId);

  if (!parsedOrgId) {
    return {
      error: jsonError("Invalid organization id", 400),
    };
  }

  const { data: org, error } = await auth.admin
    .from("organization")
    .select("id, owner_user_id")
    .eq("id", parsedOrgId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] organization lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!org || org.owner_user_id !== auth.user.id) {
    return {
      error: jsonError("Forbidden", 403),
    };
  }

  return {
    ...auth,
    org,
    orgId: parsedOrgId,
  };
}

export async function requireOwnedOrg(orgId, existingAuth = null) {
  const auth = existingAuth || (await requireUser());

  if (auth.error) {
    return auth;
  }

  return authorizeOwnedOrg(auth, orgId);
}

/* =========================================================
   USER
   ========================================================= */

export async function requireOrgForUser(userId) {
  const parsedUserId = parsePositiveInt(userId);

  if (!parsedUserId) {
    return {
      error: jsonError("Invalid user id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: row, error } = await auth.admin
    .from("user")
    .select("id, organization_id, name, email, phone_number")
    .eq("id", parsedUserId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] user lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!row) {
    return {
      error: jsonError("User not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(row.organization_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    targetUser: row,
    userId: parsedUserId,
  };
}

/* =========================================================
   ASSISTANT
   ========================================================= */

export async function requireOrgForAssistant(assistantId) {
  const parsedAssistantId = parsePositiveInt(assistantId);

  if (!parsedAssistantId) {
    return {
      error: jsonError("Invalid assistant id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: assistant, error } = await auth.admin
    .from("assistant")
    .select("*")
    .eq("id", parsedAssistantId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] assistant lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!assistant) {
    return {
      error: jsonError("Assistant not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(assistant.organization_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    assistant,
    assistantId: parsedAssistantId,
  };
}

/* =========================================================
   TAG
   ========================================================= */

export async function requireOrgForTag(tagId) {
  const parsedTagId = parsePositiveInt(tagId);

  if (!parsedTagId) {
    return {
      error: jsonError("Invalid tag id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: tag, error } = await auth.admin
    .from("tags")
    .select("id, org_id, name, color")
    .eq("id", parsedTagId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] tag lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!tag) {
    return {
      error: jsonError("Tag not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(tag.org_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    tag,
    tagId: parsedTagId,
  };
}

/* =========================================================
   SCHEDULED BROADCAST
   ========================================================= */

export async function requireOrgForScheduledBroadcast(id) {
  const broadcastId = typeof id === "string" ? id.trim() : "";

  const isValidUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      broadcastId,
    );

  if (!isValidUuid) {
    return {
      error: jsonError("Invalid scheduled broadcast id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: broadcast, error } = await auth.admin
    .from("scheduled_broadcast")
    .select(
      "id, organization_id, channel, status, scheduled_for, payload, created_by_user_id",
    )
    .eq("id", broadcastId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] scheduled broadcast lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!broadcast) {
    return {
      error: jsonError("Scheduled broadcast not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(broadcast.organization_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    broadcast,
    broadcastId,
  };
}

/* =========================================================
   THREAD
   ========================================================= */

export async function requireOrgForThread(threadId) {
  const parsedThreadId = parsePositiveInt(threadId);

  if (!parsedThreadId) {
    return {
      error: jsonError("Invalid thread id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  /*
   * IMPORTANT:
   *
   * thread does NOT have organization_id.
   *
   * Organization ownership must be derived
   * through:
   *
   * user.organization_id
   *
   * or, for group threads:
   *
   * assistant.organization_id
   *
   * We also return both OpenAI identifiers:
   *
   * ai_thread_id
   *   legacy Assistants API
   *
   * openai_conversation_id
   *   new Conversations / Responses API
   */
  const { data: thread, error } = await auth.admin
    .from("thread")
    .select("id, user_id, assistant_id, ai_thread_id, openai_conversation_id")
    .eq("id", parsedThreadId)
    .maybeSingle();

  if (error) {
    console.error("[Auth] thread lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!thread) {
    return {
      error: jsonError("Thread not found", 404),
    };
  }

  let orgId = null;

  /*
   * Personal threads:
   *
   * WhatsApp
   * Teams personal
   */
  if (thread.user_id) {
    const { data: userRow, error: userError } = await auth.admin
      .from("user")
      .select("organization_id")
      .eq("id", thread.user_id)
      .maybeSingle();

    if (userError) {
      console.error("[Auth] thread user lookup failed", userError);

      return {
        error: jsonError("Authorization check failed", 500),
      };
    }

    orgId = userRow?.organization_id ?? null;
  }

  /*
   * Group/channel threads may not have
   * a user_id. Resolve ownership through
   * their Assistant instead.
   */
  if (!orgId && thread.assistant_id) {
    const { data: assistant, error: assistantError } = await auth.admin
      .from("assistant")
      .select("organization_id")
      .eq("id", thread.assistant_id)
      .maybeSingle();

    if (assistantError) {
      console.error("[Auth] thread assistant lookup failed", assistantError);

      return {
        error: jsonError("Authorization check failed", 500),
      };
    }

    orgId = assistant?.organization_id ?? null;
  }

  if (!orgId) {
    return {
      error: jsonError("Thread has no organization", 403),
    };
  }

  const orgAuth = await requireOwnedOrg(orgId, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    thread,
    threadId: parsedThreadId,
  };
}

/* =========================================================
   AUTOMATION RULE
   ========================================================= */

export async function requireOrgForAutomationRule(id) {
  if (!id || typeof id !== "string") {
    return {
      error: jsonError("Invalid automation rule id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: rule, error } = await auth.admin
    .from("automation_rule")
    .select("id, organization_id, assistant_id, name, trigger_type, channel")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Auth] automation rule lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!rule) {
    return {
      error: jsonError("Automation rule not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(rule.organization_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    rule,
    ruleId: id,
  };
}

/* =========================================================
   TEAMS GROUP
   ========================================================= */

const TEAMS_GROUP_COLUMNS =
  "id, organization_id, assistant_id, name, conversation_id, conversation_type, service_url, tenant_id, team_id, channel_id, is_active, created_at, last_seen_at";

/* Grupo do Teams onde o bot está instalado (#165). */
export async function requireOrgForTeamsGroup(groupId) {
  const parsedGroupId = parsePositiveInt(groupId);

  if (!parsedGroupId) {
    return {
      error: jsonError("Invalid group id", 400),
    };
  }

  const auth = await requireUser();

  if (auth.error) {
    return auth;
  }

  const { data: group, error } = await auth.admin
    .from("teams_installation")
    .select(TEAMS_GROUP_COLUMNS)
    .eq("id", parsedGroupId)
    .eq("scope", "group")
    .maybeSingle();

  if (error) {
    console.error("[Auth] teams group lookup failed", error);

    return {
      error: jsonError("Authorization check failed", 500),
    };
  }

  if (!group) {
    return {
      error: jsonError("Group not found", 404),
    };
  }

  const orgAuth = await requireOwnedOrg(group.organization_id, auth);

  if (orgAuth.error) {
    return orgAuth;
  }

  return {
    ...orgAuth,
    group,
    groupId: parsedGroupId,
  };
}

/**
 * Grupos ativos da organização com estes ids (#166). Recusa a lista inteira
 * se algum não for da organização ou já não tiver o bot.
 */
export async function assertTeamsGroupsBelongToOrg(admin, orgId, groupIds) {
  const uniqueIds = [
    ...new Set((groupIds || []).map(Number).filter((id) => id > 0)),
  ];

  if (!uniqueIds.length) {
    throwHttpError("No groups selected", 400);
  }

  const { data, error } = await admin
    .from("teams_installation")
    .select(TEAMS_GROUP_COLUMNS)
    .eq("organization_id", orgId)
    .eq("scope", "group")
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  if ((data || []).length !== uniqueIds.length) {
    throwHttpError(
      "One or more groups do not belong to this organization",
      403,
    );
  }

  return data;
}

/* =========================================================
   ORGANIZATION ASSERTIONS
   ========================================================= */

export async function assertUsersBelongToOrg(admin, orgId, userIds) {
  const uniqueIds = [...new Set((userIds || []).map(Number).filter(Boolean))];

  if (!uniqueIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from("user")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  const found = new Set((data || []).map((row) => Number(row.id)));

  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length) {
    throwHttpError("One or more users do not belong to this organization", 403);
  }

  return uniqueIds;
}

export async function assertTagsBelongToOrg(admin, orgId, tagIds) {
  const uniqueIds = [...new Set((tagIds || []).map(Number).filter(Boolean))];

  if (!uniqueIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  const found = new Set((data || []).map((row) => Number(row.id)));

  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length) {
    throwHttpError("One or more tags do not belong to this organization", 403);
  }

  return uniqueIds;
}

export async function assertAssistantBelongsToOrg(admin, orgId, assistantId) {
  if (assistantId == null || assistantId === "") {
    return null;
  }

  const parsedAssistantId = parsePositiveInt(assistantId);

  if (!parsedAssistantId) {
    throwHttpError("Invalid assistant id", 400);
  }

  const { data, error } = await admin
    .from("assistant")
    .select("id")
    .eq("id", parsedAssistantId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throwHttpError("Assistant does not belong to this organization", 403);
  }

  return parsedAssistantId;
}

export async function assertAssistantsBelongToOrg(admin, orgId, assistantIds) {
  const parsedIds = (assistantIds || []).map((id) => parsePositiveInt(id));

  if (parsedIds.some((id) => !id)) {
    throwHttpError("Invalid assistant id", 400);
  }

  const uniqueIds = [...new Set(parsedIds)];

  if (!uniqueIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from("assistant")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  const found = new Set((data || []).map((row) => Number(row.id)));

  if (uniqueIds.some((id) => !found.has(id))) {
    throwHttpError(
      "One or more assistants do not belong to this organization",
      403,
    );
  }

  return uniqueIds;
}

/* =========================================================
   BROADCAST RECIPIENT SECURITY
   ========================================================= */

export function extractRecipientUserIds(recipients = []) {
  if (!Array.isArray(recipients)) {
    return [];
  }

  return [
    ...new Set(
      recipients
        .map((recipient) =>
          typeof recipient === "object"
            ? Number(recipient.userId ?? recipient.id)
            : null,
        )
        .filter(Boolean),
    ),
  ];
}

export function requireAllRecipientsToBeKnownUsers(recipients = []) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throwHttpError("At least one recipient is required", 400);
  }

  const ids = extractRecipientUserIds(recipients);

  if (ids.length !== recipients.length) {
    throwHttpError(
      "For security, broadcast recipients must be selected users, not raw phone numbers.",
      400,
    );
  }

  return ids;
}

/* =========================================================
   MICROSOFT TEAMS REQUEST VALIDATION
   ========================================================= */

const TEAMS_JWKS = createRemoteJWKSet(
  new URL("https://login.botframework.com/v1/.well-known/keys"),
);

function getTeamsJwtConfig() {
  const appId = process.env.BOT_APP_ID?.trim();

  const tenantId = process.env.AZURE_TENANT_ID?.trim() || null;

  if (!appId) {
    throwHttpError("Missing BOT_APP_ID", 500);
  }

  return {
    appId,
    tenantId,
  };
}

export async function requireValidTeamsRequest(req, activity) {
  const authHeader = req.headers.get("authorization") || "";

  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return {
      error: jsonError("Unauthorized", 401),
    };
  }

  const token = match[1].trim();

  if (!token) {
    return {
      error: jsonError("Unauthorized", 401),
    };
  }

  const { appId } = getTeamsJwtConfig();

  try {
    const { payload } = await jwtVerify(token, TEAMS_JWKS, {
      audience: appId,

      issuer: "https://api.botframework.com",

      algorithms: ["RS256"],
    });

    const tokenServiceUrl = String(payload.serviceurl || "")
      .trim()
      .replace(/\/$/, "");

    const activityServiceUrl = String(activity?.serviceUrl || "")
      .trim()
      .replace(/\/$/, "");

    if (!tokenServiceUrl || !activityServiceUrl) {
      return {
        error: jsonError("Unauthorized", 401),
      };
    }

    if (tokenServiceUrl !== activityServiceUrl) {
      return {
        error: jsonError("Unauthorized", 401),
      };
    }

    return {
      ok: true,
      payload,
    };
  } catch (error) {
    console.warn("[Teams Auth] invalid request", error?.message || error);

    return {
      error: jsonError("Unauthorized", 401),
    };
  }
}
