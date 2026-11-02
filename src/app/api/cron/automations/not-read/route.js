import { NextResponse } from "next/server";
import { getActiveAutomationRules } from "@/lib/repos/automationRules.repo";
import { getUsersInOrg } from "@/lib/repos/user.repo";
import {
  getInboundAfterForUserAssistant,
  getLastOutboundForUserAssistant,
} from "@/lib/repos/messages.repo";
import { queueAutomationRunForRule } from "@/lib/services/automations/automationEngine";
import { getAutomationRunById } from "@/lib/repos/automationRuns.repo";
import { assertAssistantBelongsToOrg } from "@/lib/auth/guards";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import { getExpiredOrganizationIds } from "@/lib/services/plans/planLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const TRIGGER_TYPE = "message.unread";

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  const xCronSecret = req.headers.get("x-cron-secret") || "";

  return bearer === cronSecret || xCronSecret === cronSecret;
}

function buildRuleResolver(rules) {
  const specificByAssistant = new Map();
  let fallbackRule = null;

  for (const rule of rules) {
    if (rule.assistant_id == null) {
      fallbackRule = rule;
      continue;
    }

    specificByAssistant.set(Number(rule.assistant_id), rule);
  }

  return { specificByAssistant, fallbackRule };
}

function getMessageStatus(message) {
  return String(
    message?.status ||
      message?.delivery_status ||
      message?.deliveryStatus ||
      message?.message_status ||
      "",
  ).toLowerCase();
}

function hasReadReceipt(message) {
  const status = getMessageStatus(message);

  return Boolean(
    message?.read_at ||
    message?.readAt ||
    message?.read_timestamp ||
    message?.readTimestamp ||
    status === "read",
  );
}

function isFailedOutbound(message) {
  const status = getMessageStatus(message);

  return [
    "failed",
    "error",
    "undelivered",
    "rejected",
    "cancelled",
    "canceled",
  ].includes(status);
}

function isPendingOutbound(message) {
  const status = getMessageStatus(message);

  return ["queued", "pending", "scheduled", "processing"].includes(status);
}

function getOutboundBaseTime(message) {
  return (
    message?.sent_at ||
    message?.sentAt ||
    message?.delivered_at ||
    message?.deliveredAt ||
    message?.created_at ||
    message?.createdAt ||
    null
  );
}

function getMetadata(message) {
  const metadata = message?.metadata || message?.payload || {};

  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return metadata;
}

function wasSentBySameAutomationRule(message, rule) {
  const metadata = getMetadata(message);

  const messageRuleId =
    message?.automation_rule_id ||
    message?.automationRuleId ||
    metadata?.automation_rule_id ||
    metadata?.automationRuleId ||
    metadata?.resolvedByRuleId ||
    metadata?.resolvedRuleId ||
    null;

  if (messageRuleId == null || rule?.id == null) {
    return false;
  }

  return String(messageRuleId) === String(rule.id);
}

/*
 * Teams stores the automation run on each message it sends, so a
 * reminder from this rule does not trigger the same rule again.
 */
async function wasSentByRuleRun(message, rule) {
  if (!message?.automation_run_id || rule?.id == null) {
    return false;
  }

  const run = await getAutomationRunById(message.automation_run_id);

  return run != null && String(run.rule_id) === String(rule.id);
}

async function processOrganizationChannel({ organizationId, channel, rules }) {
  let page = 1;
  let scanned = 0;
  let created = 0;
  let skipped = 0;

  const { specificByAssistant, fallbackRule } = buildRuleResolver(rules);
  const admin = getSupabaseAdminClient();

  while (true) {
    const result = await getUsersInOrg(organizationId, {
      page,
      pageSize: PAGE_SIZE,
    });

    const users = result.items || [];

    if (!users.length) {
      break;
    }

    for (const user of users) {
      scanned += 1;

      const userAssistantId = user.assistant_id ?? null;

      if (userAssistantId == null) {
        skipped += 1;
        continue;
      }

      await assertAssistantBelongsToOrg(admin, organizationId, userAssistantId);

      const chosenRule =
        specificByAssistant.get(Number(userAssistantId)) ||
        fallbackRule ||
        null;

      if (!chosenRule) {
        skipped += 1;
        continue;
      }

      const lastOutbound = await getLastOutboundForUserAssistant(
        user.id,
        userAssistantId,
        channel,
      );

      if (!lastOutbound) {
        skipped += 1;
        continue;
      }

      if (hasReadReceipt(lastOutbound)) {
        skipped += 1;
        continue;
      }

      if (isFailedOutbound(lastOutbound)) {
        skipped += 1;
        continue;
      }

      if (isPendingOutbound(lastOutbound)) {
        skipped += 1;
        continue;
      }

      if (
        wasSentBySameAutomationRule(lastOutbound, chosenRule) ||
        (await wasSentByRuleRun(lastOutbound, chosenRule))
      ) {
        skipped += 1;
        continue;
      }

      const outboundBaseTime = getOutboundBaseTime(lastOutbound);

      if (!outboundBaseTime) {
        skipped += 1;
        continue;
      }

      const newerInbound = await getInboundAfterForUserAssistant(
        user.id,
        userAssistantId,
        channel,
        outboundBaseTime,
      );

      if (newerInbound) {
        skipped += 1;
        continue;
      }

      const dueAt = new Date(
        new Date(outboundBaseTime).getTime() +
          Number(chosenRule.delay_minutes || 0) * 60 * 1000,
      );

      if (dueAt > new Date()) {
        skipped += 1;
        continue;
      }

      const triggerKey = `${TRIGGER_TYPE}:${channel}:${user.id}:${userAssistantId}:${lastOutbound.id}`;

      const run = await queueAutomationRunForRule({
        rule: chosenRule,
        user,
        assistantId: userAssistantId,
        sourceMessageRowId: lastOutbound.id,
        baseTime: outboundBaseTime,
        triggerKey,
        payload: {
          lastOutboundMessageId: lastOutbound.id,
          lastOutboundExternalMessageId:
            lastOutbound.message_id || lastOutbound.external_message_id || null,
          lastOutboundAt: outboundBaseTime,
          lastOutboundStatus: getMessageStatus(lastOutbound) || null,
          resolvedByRuleId: chosenRule.id,
          ruleScopeAssistantId: chosenRule.assistant_id ?? null,
          usedFallbackRule: chosenRule.assistant_id == null,
        },
      });

      if (run) {
        created += 1;
      } else {
        skipped += 1;
      }
    }

    if (page * PAGE_SIZE >= (result.total || 0)) {
      break;
    }

    page += 1;
  }

  return {
    organizationId,
    channel,
    scanned,
    created,
    skipped,
    specificRules: specificByAssistant.size,
    hasFallbackRule: Boolean(fallbackRule),
  };
}

async function handler(req) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let limitOrganizations = null;

    try {
      const url = new URL(req.url);
      const raw = url.searchParams.get("organizationId");

      if (raw) {
        limitOrganizations = Number(raw);
      }
    } catch {
      // ignore this error
    }

    /* A Demo terminou (#209): as automações dessas empresas não correm. */
    let rules = await getActiveAutomationRules({
      triggerType: TRIGGER_TYPE,
      excludeOrganizationIds: await getExpiredOrganizationIds(),
    });

    if (limitOrganizations) {
      rules = rules.filter(
        (rule) => Number(rule.organization_id) === Number(limitOrganizations),
      );
    }

    if (!rules.length) {
      return NextResponse.json({
        ok: true,
        message: "No active message.unread rules",
        processedGroups: 0,
        results: [],
      });
    }

    const grouped = new Map();

    for (const rule of rules) {
      const key = `${rule.organization_id}:${rule.channel}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(rule);
    }

    const results = [];

    for (const groupRules of grouped.values()) {
      const organizationId = Number(groupRules[0].organization_id);
      const channel = groupRules[0].channel;

      results.push(
        await processOrganizationChannel({
          organizationId,
          channel,
          rules: groupRules,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      processedGroups: results.length,
      createdRuns: results.reduce((sum, item) => sum + item.created, 0),
      scannedUsers: results.reduce((sum, item) => sum + item.scanned, 0),
      skipped: results.reduce((sum, item) => sum + item.skipped, 0),
      results,
    });
  } catch (error) {
    console.error("[Automations][MessageUnread]", error);

    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 },
    );
  }
}

export async function GET(req) {
  return handler(req);
}

export async function POST(req) {
  return handler(req);
}
