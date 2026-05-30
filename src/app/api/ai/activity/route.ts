import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { FOUNDERS } from "@/lib/constants";
import { stringField, readField } from "@/lib/recordUtils";
import {
  hasFollowUpDate,
  hasActiveFollowUpTask,
  leadFollowUpDate,
} from "@/lib/followUps";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type TableRow = { id: string; data: DashboardRecord | null };

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<DashboardRecord[]> {
  const { data: rows, error } = await db
    .from(table)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/activity] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

// A single normalised activity event — safe fields only, no note content.
type ActivityEvent = {
  id: string;
  source: "client" | "crm";
  type: string;
  date: string;
  owner: string;
  relatedId: string; // clientId (client_activity) or leadId (crm comm)
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isInWindow(date: string, fromISO: string, toISO: string): boolean {
  return ISO_DATE.test(date) && date >= fromISO && date <= toISO;
}

/**
 * GET /api/ai/activity
 *
 * Returns safe operational activity aggregates for AI consumption.
 * Sources: client_activity table and CRM lead communicationHistory.
 *
 * Excludes ALL note/summary content — the raw activity notes field from
 * client_activity and the summary field from communicationHistory are
 * never returned, even in truncated form. Safe fields only: activity type
 * (Call/Email/Text etc.), date, owner (founder name), and related entity ID.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const [clientActivity, leads, tasks] = await Promise.all([
      fetchTable(db, "client_activity"),
      fetchTable(db, "crm_leads"),
      fetchTable(db, "tasks"),
    ]);

    const todayISO      = businessTodayISO();
    const sevenAgoISO   = addDaysToISODate(todayISO, -7);
    const thirtyAgoISO  = addDaysToISODate(todayISO, -30);
    const sevenAheadISO = addDaysToISODate(todayISO, 7);

    // ── Normalise activity events ─────────────────────────────────────────────
    // client_activity rows: safe fields = type, date, owner, clientId
    // NOTE: the `notes` field is deliberately excluded.
    const clientEvents: ActivityEvent[] = clientActivity
      .filter((e) => ISO_DATE.test(stringField(e, "date")))
      .map((e) => ({
        id: e.id,
        source: "client",
        type: stringField(e, "type") || "Other",
        date: stringField(e, "date"),
        owner: stringField(e, "owner") || "",
        relatedId: stringField(e, "clientId") || stringField(e, "client_id") || "",
      }));

    // CRM communicationHistory: safe fields = type, date, owner (leadId from parent)
    // NOTE: the `summary` field is deliberately excluded.
    const crmEvents: ActivityEvent[] = [];
    for (const lead of leads) {
      const history = lead.communicationHistory;
      if (!Array.isArray(history)) continue;
      for (const entry of history) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Record<string, unknown>;
        const date = stringField(e, "date");
        if (!ISO_DATE.test(date)) continue;
        crmEvents.push({
          id: stringField(e, "id") || `${lead.id}-comm-${date}`,
          source: "crm",
          type: stringField(e, "type") || "Other",
          date,
          owner: stringField(e, "owner") || "",
          relatedId: lead.id,
        });
      }
    }

    // All events merged, newest first.
    const allEvents: ActivityEvent[] = [...clientEvents, ...crmEvents].sort(
      (a, b) => b.date.localeCompare(a.date),
    );

    // ── Time-window counts ────────────────────────────────────────────────────

    function countInWindow(events: ActivityEvent[], from: string, to: string): number {
      return events.filter((e) => isInWindow(e.date, from, to)).length;
    }

    const counts = {
      total:          allEvents.length,
      clientActivity: clientEvents.length,
      crmComms:       crmEvents.length,
      today:          countInWindow(allEvents, todayISO, todayISO),
      thisWeek:       countInWindow(allEvents, sevenAgoISO, todayISO),
      lastThirtyDays: countInWindow(allEvents, thirtyAgoISO, todayISO),
    };

    // ── By type ───────────────────────────────────────────────────────────────

    const typeCounts = new Map<string, number>();
    for (const e of allEvents) {
      typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
    }
    const byType = Array.from(typeCounts, ([type, count]) => ({ type, count })).sort(
      (a, b) => b.count - a.count || a.type.localeCompare(b.type),
    );

    // ── By owner (founders only) ──────────────────────────────────────────────

    const byOwner: Record<string, { total: number; today: number; thisWeek: number }> = {};
    for (const founder of FOUNDERS) {
      const owned = allEvents.filter((e) =>
        e.owner.toLowerCase().includes(founder.toLowerCase()),
      );
      byOwner[founder] = {
        total:    owned.length,
        today:    countInWindow(owned, todayISO, todayISO),
        thisWeek: countInWindow(owned, sevenAgoISO, todayISO),
      };
    }

    // ── Recent events (last 10) — safe fields only, no content ───────────────

    const recentEvents = allEvents.slice(0, 10).map((e) => ({
      id:        e.id,
      source:    e.source,
      type:      e.type,
      date:      e.date,
      owner:     e.owner,
      relatedId: e.relatedId,
    }));

    // ── Follow-up stats (from CRM leads + tasks) ──────────────────────────────

    const openLeads = leads.filter(
      (lead) =>
        stringField(lead, "status").toLowerCase() !== "won" &&
        stringField(lead, "stage").toLowerCase() !== "won",
    );

    const followUpsDueToday = openLeads.filter((lead) => {
      const d = leadFollowUpDate(lead);
      return hasFollowUpDate(d) && d === todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    const followUpsOverdue = openLeads.filter((lead) => {
      const d = leadFollowUpDate(lead);
      return hasFollowUpDate(d) && d < todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    const followUpsDueThisWeek = openLeads.filter((lead) => {
      const d = leadFollowUpDate(lead);
      return (
        hasFollowUpDate(d) &&
        d >= todayISO &&
        d <= sevenAheadISO &&
        hasActiveFollowUpTask(lead, tasks)
      );
    });

    // Overdue follow-ups needing attention — company name only (no contact PII).
    const overdueFollowUps = followUpsOverdue.slice(0, 10).map((lead) => ({
      leadId:     lead.id,
      company:    stringField(lead, "company") || "Lead",
      owner:      stringField(lead, "owner") || "",
      followUpDate: readField(lead, "followUpDate", "follow_up_date") || null,
    }));

    return okResponse({
      date: todayISO,
      counts,
      byType,
      byOwner,
      recentEvents,
      followUps: {
        overdue:      followUpsOverdue.length,
        dueToday:     followUpsDueToday.length,
        dueThisWeek:  followUpsDueThisWeek.length,
        overdueItems: overdueFollowUps,
      },
    });
  } catch (err) {
    console.error("[ai/activity]", err);
    return errResponse("Internal server error", 500);
  }
}
