import { getActiveAutomationRules } from "@/lib/repos/automationRules.repo";
import { getUsersInOrg } from "@/lib/repos/user.repo";
import { getLastInboundForUserAssistant } from "@/lib/repos/messages.repo";
import { queueAutomationRunForRule } from "@/lib/services/automations/automationEngine";
import { getExpiredOrganizationIds } from "@/lib/services/plans/planLimits";

const PAGE_SIZE = 500;

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

async function processOrganizationChannel({ organizationId, channel, rules }) {
  let page = 1;
  let scanned = 0;
  let created = 0;
  let skipped = 0;

  const { specificByAssistant, fallbackRule } = buildRuleResolver(rules);

  while (true) {
    const result = await getUsersInOrg(organizationId, {
      page,
      pageSize: PAGE_SIZE,
    });

    const users = result.items || [];
    if (!users.length) break;

    for (const user of users) {
      scanned += 1;

      const userAssistantId = user.assistant_id ?? null;

      if (userAssistantId == null) {
        skipped += 1;
        continue;
      }

      const chosenRule =
        specificByAssistant.get(Number(userAssistantId)) ||
        fallbackRule ||
        null;

      if (!chosenRule) {
        skipped += 1;
        continue;
      }

      const lastInbound = await getLastInboundForUserAssistant(
        user.id,
        userAssistantId,
        channel,
      );

      if (!lastInbound) {
        skipped += 1;
        continue;
      }

      const dueAt = new Date(
        new Date(lastInbound.created_at).getTime() +
          Number(chosenRule.delay_minutes || 0) * 60 * 1000,
      );

      if (dueAt > new Date()) {
        skipped += 1;
        continue;
      }

      const triggerKey = `user.inactive:${channel}:${user.id}:${userAssistantId}:${lastInbound.id}`;

      const run = await queueAutomationRunForRule({
        rule: chosenRule,
        user,
        assistantId: userAssistantId,
        sourceMessageRowId: lastInbound.id,
        baseTime: lastInbound.created_at,
        triggerKey,
        payload: {
          lastInboundMessageId: lastInbound.id,
          lastInboundAt: lastInbound.created_at,
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

export async function runInactivityScan({ organizationId = null } = {}) {
  /* A Demo terminou (#209): as automações dessas empresas não correm. */
  const rules = await getActiveAutomationRules({
    triggerType: "user.inactive",
    organizationId,
    excludeOrganizationIds: await getExpiredOrganizationIds(),
  });

  if (!rules.length) {
    return {
      ok: true,
      message: "No active inactivity rules",
      processedGroups: 0,
      results: [],
    };
  }

  const grouped = new Map();

  for (const rule of rules) {
    const key = `${rule.organization_id}:${rule.channel}`;
    if (!grouped.has(key)) grouped.set(key, []);
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

  return {
    ok: true,
    processedGroups: results.length,
    createdRuns: results.reduce((sum, item) => sum + item.created, 0),
    scannedUsers: results.reduce((sum, item) => sum + item.scanned, 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    results,
  };
}
