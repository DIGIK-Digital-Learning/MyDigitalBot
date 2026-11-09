import { getRepositoryReadClient } from "@/lib/db/readAccess";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import { fetchExportRows } from "./analytics/analyticsBase.repo";

export async function createTrackedLink(row) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("tracked_link")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTrackedLinkByToken(token) {
  const supabaseAdmin = getRepositoryReadClient();
  const { data, error } = await supabaseAdmin
    .from("tracked_link")
    .select("*")
    .eq("token", token)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data;
}

export async function createTrackedLinkEvent(row) {
  const supabaseAdmin = getSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from("tracked_link_event")
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/*
 * Links já usados pela organização, um por nome e destino, do mais recente
 * para o mais antigo. Lê a vista tracked_link_library.
 */
export async function getTrackedLinkLibraryByOrg(orgId, { limit = 200 } = {}) {
  const supabaseAdmin = getRepositoryReadClient();
  const { data, error } = await supabaseAdmin
    .from("tracked_link_library")
    .select("link_key, link_label, destination_url, last_used_at")
    .eq("org_id", orgId)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

export async function getTrackedLinkReportsByOrg(
  orgId,
  periodStart = null,
  { paginate = false } = {},
) {
  const supabaseAdmin = getRepositoryReadClient();
  let rows;

  if (paginate) {
    rows = await fetchExportRows(
      "tracked_link",
      "id, org_id, channel, recipient_user_id, scheduled_broadcast_id, send_group_id, destination_url, link_label, link_key, source_type, created_at",
      (query) => {
        query = query.eq("org_id", orgId);

        return periodStart ? query.gte("created_at", periodStart) : query;
      },
      {},
      supabaseAdmin,
    );

    // Read events separately: embedded arrays can also be capped by PostgREST.
    const eventsByLink = new Map();

    for (let offset = 0; offset < rows.length; offset += 200) {
      const ids = rows.slice(offset, offset + 200).map((row) => row.id);

      const events = await fetchExportRows(
        "tracked_link_event",
        "id, tracked_link_id, created_at",
        (query) => query.in("tracked_link_id", ids),
        {},
        supabaseAdmin,
      );

      for (const event of events) {
        const eventsForLink = eventsByLink.get(event.tracked_link_id) ?? [];

        eventsForLink.push(event);
        eventsByLink.set(event.tracked_link_id, eventsForLink);
      }
    }

    rows = rows.map((row) => ({
      ...row,
      tracked_link_event: eventsByLink.get(row.id) ?? [],
    }));

    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    const { data: links, error } = await supabaseAdmin
      .from("tracked_link")
      .select(
        `
        id,
        org_id,
        channel,
        recipient_user_id,
        scheduled_broadcast_id,
        send_group_id,
        destination_url,
        link_label,
        link_key,
        source_type,
        created_at,
        recipient:user!tracked_link_recipient_user_id_fkey (
          id,
          name,
          email,
          phone_number
        ),
        tracked_link_event (
          id,
          created_at
        )
      `,
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    rows = Array.isArray(links) ? links : [];
  }

  const grouped = new Map();

  for (const row of rows) {
    const groupKey =
      row.send_group_id ||
      [
        row.channel || "",
        row.scheduled_broadcast_id || "manual",
        row.link_key || "",
        row.destination_url || "",
        row.link_label || "",
        row.source_type || "",
      ].join("|");

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        groupKey,
        sendGroupId: row.send_group_id || null,
        scheduledBroadcastId: row.scheduled_broadcast_id || null,
        linkKey: row.link_key || "",
        linkLabel: row.link_label || "",
        destinationUrl: row.destination_url || "",
        channel: row.channel || "",
        sourceType: row.source_type || "",
        createdAt: row.created_at || null,
        recipientIds: new Set(),
        clickedRecipientIds: new Set(),
        totalClicks: 0,
      });
    }

    const group = grouped.get(groupKey);
    const recipientId = row.recipient_user_id;

    if (recipientId != null) {
      group.recipientIds.add(String(recipientId));
    }

    const clickCount = Array.isArray(row.tracked_link_event)
      ? row.tracked_link_event.length
      : 0;

    group.totalClicks += clickCount;

    if (clickCount > 0 && recipientId != null) {
      group.clickedRecipientIds.add(String(recipientId));
    }
  }

  return Array.from(grouped.values()).map((group) => {
    const recipientCount = group.recipientIds.size;
    const clickedCount = group.clickedRecipientIds.size;

    const clickRate =
      recipientCount > 0
        ? Number(((clickedCount / recipientCount) * 100).toFixed(1))
        : 0;

    return {
      groupKey: group.groupKey,
      sendGroupId: group.sendGroupId,
      scheduledBroadcastId: group.scheduledBroadcastId,
      linkKey: group.linkKey,
      linkLabel: group.linkLabel,
      destinationUrl: group.destinationUrl,
      channel: group.channel,
      sourceType: group.sourceType,
      createdAt: group.createdAt,
      recipientCount,
      clickedCount,
      totalClicks: group.totalClicks,
      clickRate,
    };
  });
}

export async function getTrackedLinkReportDetail({ orgId, sendGroupId }) {
  const supabaseAdmin = getRepositoryReadClient();
  if (!sendGroupId) return null;

  const { data, error } = await supabaseAdmin
    .from("tracked_link")
    .select(
      `
      id,
      org_id,
      channel,
      recipient_user_id,
      scheduled_broadcast_id,
      send_group_id,
      destination_url,
      link_label,
      link_key,
      source_type,
      created_at,
      recipient:user!tracked_link_recipient_user_id_fkey (
        id,
        name,
        email,
        phone_number
      ),
      tracked_link_event (
        id,
        created_at
      )
    `,
    )
    .eq("org_id", orgId)
    .eq("send_group_id", sendGroupId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) return null;

  const first = rows[0];
  const clicked = [];
  const notClicked = [];

  for (const row of rows) {
    const events = Array.isArray(row.tracked_link_event)
      ? [...row.tracked_link_event].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        )
      : [];

    const clickCount = events.length;
    const recipient = row.recipient || null;

    const base = {
      trackedLinkId: row.id,
      recipientUserId: row.recipient_user_id,
      name: recipient?.name || null,
      email: recipient?.email || null,
      phoneNumber: recipient?.phone_number || null,
      createdAt: row.created_at || null,
    };

    if (clickCount > 0) {
      clicked.push({
        ...base,
        clickCount,
        firstClickAt: events[0]?.created_at || null,
        lastClickAt: events[events.length - 1]?.created_at || null,
      });
    } else {
      notClicked.push(base);
    }
  }

  const totalRecipients = rows.length;
  const clickedCount = clicked.length;
  const notClickedCount = notClicked.length;

  const totalClicks = clicked.reduce((sum, item) => sum + item.clickCount, 0);

  const clickRate =
    totalRecipients > 0
      ? Number(((clickedCount / totalRecipients) * 100).toFixed(1))
      : 0;

  return {
    summary: {
      sendGroupId: first.send_group_id || null,
      scheduledBroadcastId: first.scheduled_broadcast_id || null,
      linkKey: first.link_key || "",
      linkLabel: first.link_label || "",
      destinationUrl: first.destination_url || "",
      channel: first.channel || "",
      sourceType: first.source_type || "",
      createdAt: first.created_at || null,
      totalRecipients,
      clickedCount,
      notClickedCount,
      totalClicks,
      clickRate,
    },
    clicked,
    notClicked,
  };
}
