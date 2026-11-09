"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchDashboardOverview } from "../lib/dashboard.api";
import { normalizeDashboardOverview } from "../lib/dashboard.helpers";

export default function useDashboardOverview(orgId, enabled = true) {
  const [overview, setOverview] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled || !orgId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboardOverview(orgId);

      setOverview(normalizeDashboardOverview(data));
      setUpdatedAt(new Date());
    } catch (err) {
      console.error("[Dashboard] overview load error: ", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [enabled, orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { overview, updatedAt, loading, error, refresh };
}
