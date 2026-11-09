import { EMPTY_OVERVIEW } from "./dashboard.constants";

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function percentage(value, total) {
  const safeTotal = toNumber(total);

  if (!safeTotal) return 0;

  return Math.min(100, Math.round((toNumber(value) / safeTotal) * 100));
}

export function normalizeDashboardOverview(data) {
  return {
    users: {
      ...EMPTY_OVERVIEW.users,
      ...(data?.users || {}),
    },

    content: {
      ...EMPTY_OVERVIEW.content,
      ...(data?.content || {}),
    },

    automations: {
      ...EMPTY_OVERVIEW.automations,
      ...(data?.automations || {}),
    },

    activity: {
      ...EMPTY_OVERVIEW.activity,
      ...(data?.activity || {}),
      series: Array.isArray(data?.activity?.series) ? data.activity.series : [],
    },

    upcoming: Array.isArray(data?.upcoming) ? data.upcoming : [],
  };
}
