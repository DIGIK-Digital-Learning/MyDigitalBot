export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getUsersInOrg } from "@/lib/repos/user.repo";
import {
  getTagsByExactNamesInOrg,
  addTagsToUser,
} from "@/lib/repos/tag.repo.js";
import { createUserWithAutomations } from "@/lib/services/automations/createUserWithAutomations";
import { checkPlanActive } from "@/lib/services/plans/planLimits";
import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import {
  assertAssistantBelongsToOrg,
  handleApiError,
  requireOwnedOrg,
} from "@/lib/auth/guards";

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function cleanEmail(value) {
  const email = cleanText(value).toLowerCase();
  return email || null;
}

function cleanDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

function cleanPhoneNumber(value) {
  const phone = cleanText(value).replace(/[^\d+]/g, "");
  return phone || null;
}

function normalizeCountryCode(value) {
  const code = cleanText(value).replace(/[^\d+]/g, "");

  if (!code) return "";
  return code.startsWith("+") ? code : `+${code}`;
}

function buildFullPhone({ phoneNumber, phoneCountryCode, phoneNational }) {
  const explicit = cleanPhoneNumber(phoneNumber);

  if (explicit) {
    return explicit;
  }

  const code = normalizeCountryCode(phoneCountryCode);
  const national = cleanDigits(phoneNational);

  if (code && national) {
    return `${code}${national}`;
  }

  return null;
}

// Aceita um id ou vários separados por ";" (ex.: "3;7"); o primeiro é o ativo.
function parseAssistantIds(value) {
  if (value === "" || value == null) return [];

  const ids = String(value)
    .split(/[;|]/)
    .map((part) => Number(part.trim()))
    .filter((parsed) => Number.isInteger(parsed) && parsed > 0);

  return [...new Set(ids)];
}

async function addAssistantsToUser(admin, userId, assistantIds) {
  if (!assistantIds.length) return;

  const { error } = await admin.from("user_assistant").upsert(
    assistantIds.map((assistantId) => ({
      user_id: userId,
      assistant_id: assistantId,
    })),
    { onConflict: "user_id,assistant_id", ignoreDuplicates: true },
  );

  if (error) throw error;
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((tag) => cleanText(tag)).filter(Boolean))];
  }

  const raw = cleanText(value);

  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((tag) => cleanText(tag))
        .filter(Boolean),
    ),
  ];
}

function getCreatedUserId(resultValue) {
  return (
    resultValue?.id ||
    resultValue?.user?.id ||
    resultValue?.data?.id ||
    resultValue?.createdUser?.id ||
    resultValue?.[0]?.id ||
    null
  );
}

function findExistingUserForImport({
  existingUsers,
  email,
  teamsAadObjectId,
  phoneNumber,
}) {
  const matches = [];

  if (teamsAadObjectId) {
    const match = existingUsers.find(
      (user) => cleanText(user.teams_aad_object_id) === teamsAadObjectId,
    );

    if (match) matches.push(match);
  }

  if (email) {
    const match = existingUsers.find(
      (user) => cleanEmail(user.email) === email,
    );

    if (match) matches.push(match);
  }

  if (phoneNumber) {
    const match = existingUsers.find(
      (user) => cleanPhoneNumber(user.phone_number) === phoneNumber,
    );

    if (match) matches.push(match);
  }

  const uniqueMatches = Array.from(
    new Map(matches.map((user) => [user.id, user])).values(),
  );

  if (uniqueMatches.length > 1) {
    return {
      status: "conflict",
      user: null,
    };
  }

  if (uniqueMatches.length === 1) {
    return {
      status: "found",
      user: uniqueMatches[0],
    };
  }

  return {
    status: "not_found",
    user: null,
  };
}

async function updateImportedUser(adminClient, orgId, userId, patch) {
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  if (!Object.keys(cleanPatch).length) {
    return { id: userId };
  }

  const { data, error } = await adminClient
    .from("user")
    .update(cleanPatch)
    .eq("id", userId)
    .eq("organization_id", orgId)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function POST(req) {
  try {
    const { organizationId, users } = await req.json();

    if (!organizationId || !Array.isArray(users)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const orgId = Number(organizationId);

    if (!Number.isInteger(orgId) || orgId <= 0) {
      return NextResponse.json(
        { error: "Invalid organizationId" },
        { status: 400 },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);
    if (orgAuth.error) return orgAuth.error;

    /* A Demo terminou (#209): ver continua, criar e enviar não. */
    const active = await checkPlanActive(orgAuth.orgId);
    if (active.body) return NextResponse.json(active.body, { status: 403 });

    const requestedTagNames = new Set();

    users.forEach((rawUser) => {
      parseTags(rawUser.tags).forEach((tagName) => {
        requestedTagNames.add(tagName);
      });
    });

    const tagRows = await getTagsByExactNamesInOrg(
      orgAuth.admin,
      orgAuth.orgId,
      Array.from(requestedTagNames),
    );

    const tagsByName = new Map();

    tagRows.forEach((tag) => {
      const name = cleanText(tag.name);

      if (name) {
        tagsByName.set(name, tag);
      }
    });

    const existingUsersResult = await getUsersInOrg(orgAuth.orgId, {
      page: 1,
      pageSize: 1000,
    });

    const existingUsers = existingUsersResult.items || [];

    const seenEmails = new Set();
    const seenAadIds = new Set();
    const seenPhones = new Set();
    const seenExistingUserIds = new Set();

    const skippedRows = [];
    const toProcess = [];

    users.forEach((rawUser, index) => {
      const rowNumber = index + 1;

      const name = cleanText(rawUser.name);
      const email = cleanEmail(rawUser.email);

      const teamsAadObjectId = cleanText(rawUser.teamsAadObjectId) || null;
      const teamsFromId = cleanText(rawUser.teamsFromId) || null;

      const phoneCountryCode =
        normalizeCountryCode(rawUser.phoneCountryCode) || null;

      const phoneNational = cleanDigits(rawUser.phoneNational) || null;

      const phoneNumber = buildFullPhone({
        phoneNumber: rawUser.phoneNumber,
        phoneCountryCode,
        phoneNational,
      });

      const assistantIds = parseAssistantIds(rawUser.assistantId);
      const assistantId = assistantIds[0] ?? null;

      const tagNames = parseTags(rawUser.tags);

      const missingTagNames = tagNames.filter(
        (tagName) => !tagsByName.has(tagName),
      );

      if (!email && !teamsAadObjectId && !phoneNumber) {
        skippedRows.push({
          row: rowNumber,
          name,
          reason: "No email, Teams AAD Object ID, or phone number found",
        });
        return;
      }

      const matchResult = findExistingUserForImport({
        existingUsers,
        email,
        teamsAadObjectId,
        phoneNumber,
      });

      if (matchResult.status === "conflict") {
        skippedRows.push({
          row: rowNumber,
          name,
          reason:
            "Multiple matching users found. Email, phone, or Teams AAD Object ID belong to different users.",
        });
        return;
      }

      const existingUser = matchResult.user;
      const existingUserId = existingUser?.id || null;
      const displayName = name || cleanText(existingUser?.name);

      if (!existingUser && !name) {
        skippedRows.push({
          row: rowNumber,
          name: "",
          reason: "Missing name",
        });
        return;
      }

      if (missingTagNames.length) {
        skippedRows.push({
          row: rowNumber,
          name: displayName,
          reason: `Unknown tag(s): ${missingTagNames.join(", ")}`,
        });
        return;
      }

      if (existingUserId && seenExistingUserIds.has(existingUserId)) {
        skippedRows.push({
          row: rowNumber,
          name: displayName,
          reason: "Duplicate row for the same existing user",
        });
        return;
      }

      if (email && seenEmails.has(email)) {
        skippedRows.push({
          row: rowNumber,
          name: displayName,
          reason: "Duplicate email in import file",
        });
        return;
      }

      if (teamsAadObjectId && seenAadIds.has(teamsAadObjectId)) {
        skippedRows.push({
          row: rowNumber,
          name: displayName,
          reason: "Duplicate Teams AAD Object ID in import file",
        });
        return;
      }

      if (phoneNumber && seenPhones.has(phoneNumber)) {
        skippedRows.push({
          row: rowNumber,
          name: displayName,
          reason: "Duplicate phone number in import file",
        });
        return;
      }

      const tagIds = tagNames.map((tagName) => tagsByName.get(tagName).id);

      if (email) seenEmails.add(email);
      if (teamsAadObjectId) seenAadIds.add(teamsAadObjectId);
      if (phoneNumber) seenPhones.add(phoneNumber);
      if (existingUserId) seenExistingUserIds.add(existingUserId);

      if (existingUser) {
        const patch = {};

        if (name) patch.name = name;
        if (email) patch.email = email;
        if (assistantId) patch.assistant_id = assistantId;

        if (phoneNumber) {
          patch.phone_number = phoneNumber;
          patch.phone_country_code = phoneCountryCode || null;
          patch.phone_national = phoneNational || null;
        }

        if (teamsAadObjectId) patch.teams_aad_object_id = teamsAadObjectId;
        if (teamsFromId) patch.teams_from_id = teamsFromId;

        toProcess.push({
          action: "update",
          existingUserId: existingUser.id,
          patch,
          assistantIds,
          tagIds,
          name: displayName,
          __row: rowNumber,
        });

        return;
      }

      toProcess.push({
        action: "create",
        organizationId: orgAuth.orgId,
        name,
        email,
        assistantId,
        assistantIds,
        phoneNumber: phoneNumber || undefined,
        phoneCountryCode: phoneNumber
          ? phoneCountryCode || undefined
          : undefined,
        phoneNational: phoneNumber ? phoneNational || undefined : undefined,
        teamsAadObjectId,
        teamsFromId,
        tagIds,
        __row: rowNumber,
      });
    });

    const requestedAssistantIds = [
      ...new Set(
        toProcess.flatMap((item) => item.assistantIds || []).filter(Boolean),
      ),
    ];

    const safeAssistantIds = new Map();

    for (const requestedAssistantId of requestedAssistantIds) {
      const safeAssistantId = await assertAssistantBelongsToOrg(
        orgAuth.admin,
        orgAuth.orgId,
        requestedAssistantId,
      );

      safeAssistantIds.set(requestedAssistantId, safeAssistantId);
    }

    toProcess.forEach((item) => {
      if (item.assistantId != null) {
        item.assistantId = safeAssistantIds.get(item.assistantId);
      }

      if (item.patch?.assistant_id != null) {
        item.patch.assistant_id = safeAssistantIds.get(item.patch.assistant_id);
      }

      item.assistantIds = (item.assistantIds || []).map((id) =>
        safeAssistantIds.get(id),
      );
    });

    const results = await Promise.allSettled(
      toProcess.map(async (item) => {
        if (item.action === "update") {
          const updatedUser = await updateImportedUser(
            orgAuth.admin,
            orgAuth.orgId,
            item.existingUserId,
            item.patch,
          );

          // Como nas tags: junta aos que o utilizador já tem, não retira.
          await addAssistantsToUser(
            orgAuth.admin,
            item.existingUserId,
            item.assistantIds,
          );

          if (item.tagIds.length) {
            await addTagsToUser(
              orgAuth.admin,
              item.existingUserId,
              item.tagIds,
            );
          }

          return {
            action: "update",
            user: updatedUser,
          };
        }

        const createdUser = await createUserWithAutomations({
          organizationId: item.organizationId,
          name: item.name,
          email: item.email,
          assistantId: item.assistantId,
          assistantIds: item.assistantIds,
          phoneNumber: item.phoneNumber,
          phoneCountryCode: item.phoneCountryCode,
          phoneNational: item.phoneNational,
          teamsAadObjectId: item.teamsAadObjectId,
          teamsFromId: item.teamsFromId,
        });

        const createdUserId = getCreatedUserId(createdUser);

        if (item.tagIds.length) {
          if (!createdUserId) {
            throw new Error(
              "User was created, but no user ID was returned to attach tags.",
            );
          }

          await addTagsToUser(orgAuth.admin, createdUserId, item.tagIds);
        }

        return {
          action: "create",
          user: createdUser,
        };
      }),
    );

    const failedRows = [];
    let created = 0;
    let updated = 0;

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        if (result.value.action === "update") {
          updated += 1;
        } else {
          created += 1;
        }

        return;
      }

      const source = toProcess[index];

      const message =
        result.reason?.message ||
        result.reason?.error_description ||
        "Failed to process user";

      failedRows.push({
        row: source.__row,
        name: source.name,
        reason: message,
      });
    });

    if (created > 0 || updated > 0) {
      await recordAuditEvent(orgAuth, {
        action: AUDIT_ACTIONS.USER_IMPORTED,
        details: {
          totalReceived: users.length,
          created,
          updated,
          skipped: skippedRows.length,
          failed: failedRows.length,
        },
      });
    }

    return NextResponse.json({
      totalReceived: users.length,
      created,
      updated,
      skipped: skippedRows.length,
      failed: failedRows.length,
      skippedRows,
      failedRows,
    });
  } catch (error) {
    return handleApiError(error, "Import failed");
  }
}
