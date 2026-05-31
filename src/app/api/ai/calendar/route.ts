import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";

export const dynamic = "force-dynamic";

// ── GET /api/ai/calendar ───────────────────────────────────────────────────────
//
// Returns today's calendar events and the next 7 calendar days from the
// HQ calendar_events table. Cancelled events are excluded. Notes and source
// are never returned — safe fields only.
//
// "Meetings" for hasMeetingsToday: Client Meeting, Demo, Video Call, Internal Meeting.
// "Deliveries" for hasDeliveriesToday: Delivery type only.

const MEETING_TYPES = new Set([
  "Client Meeting",
  "Demo",
  "Video Call",
  "Internal Meeting",
]);

type RawRow = { id: string; data: Record<string, unknown> | null };

type CalendarEventOut = {
  id: string;
  title: string | null;
  date: string | null;
  time: string | null;
  endTime: string | null;
  type: string | null;
  priority: string | null;
  assignedTo: string[];
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatEvent(id: string, d: Record<string, unknown>): CalendarEventOut {
  return {
    id,
    title:      (d.title as string) ?? null,
    date:       (d.date as string) ?? null,
    time:       (d.time as string) ?? null,
    endTime:    (d.endTime as string) ?? null,
    type:       (d.type as string) ?? null,
    priority:   (d.priority as string) ?? null,
    assignedTo: Array.isArray(d.assignedTo) ? (d.assignedTo as string[]) : [],
  };
}

function byDateThenTime(a: CalendarEventOut, b: CalendarEventOut): number {
  if (a.date !== b.date) return (a.date ?? "").localeCompare(b.date ?? "");
  return (a.time ?? "").localeCompare(b.time ?? "");
}

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("calendar_events")
      .select("id,data");

    if (error && (error as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/calendar] fetch: ${error.message}`);
    }

    const allRows = (rows ?? []) as RawRow[];

    const todayStr   = todayISO();
    const weekEndStr = addDays(todayStr, 7);

    const todayEvents: CalendarEventOut[]    = [];
    const thisWeekEvents: CalendarEventOut[] = [];

    for (const row of allRows) {
      const d = row.data ?? {};
      if (d.cancelled === true) continue;

      const dateStr = (d.date as string | undefined) ?? "";
      if (!dateStr) continue;

      if (dateStr === todayStr) {
        todayEvents.push(formatEvent(row.id, d));
      } else if (dateStr > todayStr && dateStr <= weekEndStr) {
        thisWeekEvents.push(formatEvent(row.id, d));
      }
    }

    todayEvents.sort(byDateThenTime);
    thisWeekEvents.sort(byDateThenTime);

    const todayCount          = todayEvents.length;
    const hasDeliveriesToday  = todayEvents.some((e) => e.type === "Delivery");
    const hasMeetingsToday    = todayEvents.some((e) => MEETING_TYPES.has(e.type ?? ""));

    return okResponse({
      date: todayStr,
      todayCount,
      hasDeliveriesToday,
      hasMeetingsToday,
      today:    todayEvents,
      thisWeek: thisWeekEvents,
    });
  } catch (err) {
    console.error("[ai/calendar GET]", err);
    return errResponse("Internal server error", 500);
  }
}
