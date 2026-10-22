export async function fetchDashboardOverview(orgId) {
  const response = await fetch(`/api/dashboard/overview?orgId=${orgId}`);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Failed to load dashboard overview");
  }

  return data;
}
