import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repos/plans.repo", () => ({ getOrganizationPlan: vi.fn() }));

import { getOrgLimits, hasRoomFor } from "@/lib/services/plans/planLimits";

/* Um plano como fica na tabela depois da migration. */
const DEMO = {
  id: 1,
  name: "Demo",
  level: 0,
  max_users: 3,
  duration_days: 7,
  max_assistants: 1,
  max_assistant_instruction_chars: 5000,
  max_files_per_assistant: 5,
  max_automations: 20,
  max_scheduled_messages: 100,
  max_tracked_links: 100,
  max_daily_messages_per_channel: 10,
  max_collaborator_weekly_messages: 100,
  max_message_chars: 1500,
  max_files_per_message: 5,
  max_file_size_mb: 50,
  max_chain_messages: 10,
};

const ENTERPRISE = { ...DEMO, id: 3, name: "Enterprise", level: 4, max_users: null, duration_days: null, max_assistants: 20 };

function limitsOf(org, now) {
  return getOrgLimits(7, {
    now,
    deps: { getOrganizationPlan: vi.fn(() => Promise.resolve(org)) },
  });
}

describe("getOrgLimits", () => {
  it("devolve os limites do plano com nomes do código", async () => {
    const result = await limitsOf({
      id: 7,
      plan_started_at: "2026-10-19T10:00:00Z",
      max_users_override: null,
      plan: DEMO,
    });

    expect(result.plan).toEqual({ id: 1, name: "Demo", level: 0 });
    expect(result.limits).toEqual({
      users: 3,
      assistants: 1,
      assistantInstructionChars: 5000,
      filesPerAssistant: 5,
      automations: 20,
      scheduledMessages: 100,
      trackedLinks: 100,
      dailyMessagesPerChannel: 10,
      collaboratorWeeklyMessages: 100,
      messageChars: 1500,
      filesPerMessage: 5,
      fileSizeMb: 50,
      chainMessages: 10,
    });
  });

  it("a Demo acaba 7 dias depois de começar", async () => {
    const org = {
      id: 7,
      plan_started_at: "2026-10-19T10:00:00Z",
      max_users_override: null,
      plan: DEMO,
    };

    const sixDays = await limitsOf(org, new Date("2026-10-25T10:00:00Z"));
    const sevenDays = await limitsOf(org, new Date("2026-10-26T10:00:00Z"));

    expect(sixDays.expiresAt).toEqual(new Date("2026-10-26T10:00:00Z"));
    expect(sixDays.expired).toBe(false);
    expect(sevenDays.expired).toBe(true);
  });

  it("um plano sem duração nunca acaba e sem limite fica null", async () => {
    const result = await limitsOf(
      { id: 1, plan_started_at: "2026-10-19T10:00:00Z", max_users_override: null, plan: ENTERPRISE },
      new Date("2030-01-01T00:00:00Z"),
    );

    expect(result.expiresAt).toBeNull();
    expect(result.expired).toBe(false);
    expect(result.limits.users).toBeNull();
  });

  it("o limite de utilizadores da organização sobrepõe-se ao do plano", async () => {
    const result = await limitsOf({
      id: 7,
      plan_started_at: null,
      max_users_override: 12,
      plan: DEMO,
    });

    expect(result.limits.users).toBe(12);
  });

  it("sem plano é erro, para nunca ficar sem limites por engano", async () => {
    await expect(
      limitsOf({ id: 7, plan_started_at: null, max_users_override: null, plan: null }),
    ).rejects.toThrow("has no plan");
  });

  it("organização que não existe é erro", async () => {
    await expect(limitsOf(null)).rejects.toThrow("not found");
  });
});

describe("hasRoomFor", () => {
  it.each([
    [20, 19, 1, true],
    [20, 20, 1, false],
    [5, 3, 3, false],
    [null, 999, 1, true],
  ])("limite %s, já tem %s, junta %s → %s", (limit, current, adding, expected) => {
    expect(hasRoomFor(limit, current, adding)).toBe(expected);
  });
});
