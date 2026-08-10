import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { occurrenceDates, type RecurrenceRule } from "@/lib/recurrence";

export const dynamic = "force-dynamic";

// GET/POST /api/recurrence/extend
// Rolling top-up for recurring calendar_events: for each active series, materialize
// any occurrences between its latest existing one and today+HORIZON. Idempotent
// (occurrence rows are keyed "<series_id>::<date>", so an upsert never duplicates).
// Tasks are NOT extended here — they generate the next on completion.
//
// AUTH: Vercel cron secret (Bearer $CRON_SECRET) OR a founder session.
const HORIZON_DAYS = 120;

async function authorize(request: Request): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  const session = await validateSessionRequest(request);
  return session.ok;
}

function horizonEnd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

async function handle(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();

  const { data: rows, error } = await db
    .from("calendar_events")
    .select("id, data")
    .not("data->>series_id", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  // Group by series_id → { rule, startDate (earliest), latest occurrence }.
  type Agg = { rule: RecurrenceRule; template: Record<string, unknown>; start: string; latest: string };
  const series = new Map<string, Agg>();
  for (const r of rows ?? []) {
    const d = r.data as Record<string, unknown>;
    const sid = String(d.series_id ?? "");
    const rule = d.recurrence as RecurrenceRule | undefined;
    const occ = String(d.occurrence_date ?? d.date ?? "");
    if (!sid || !rule || !occ) continue;
    const cur = series.get(sid);
    if (!cur) series.set(sid, { rule, template: d, start: occ, latest: occ });
    else { if (occ < cur.start) cur.start = occ; if (occ > cur.latest) { cur.latest = occ; cur.template = d; } }
  }

  const end = horizonEnd();
  let created = 0, extended = 0;
  for (const [sid, agg] of series) {
    // Occurrences from series start through the horizon, keep only those AFTER the
    // latest existing one (so we only add the gap; upsert makes it idempotent anyway).
    const all = occurrenceDates(agg.rule, agg.start, { maxDate: end });
    const missing = all.filter((date) => date > agg.latest);
    if (!missing.length) continue;
    // Clean template: drop instance-specific keys; the horizon rows inherit the
    // latest occurrence's shared fields (title/time/type/assignees/notes).
    const { id: _id, date: _date, occurrence_date: _od, detached: _det, ...shared } = agg.template as Record<string, unknown>;
    void _id; void _date; void _od; void _det;
    const newRows = missing.map((date) => ({
      id: `${sid}::${date}`,
      data: { ...shared, id: `${sid}::${date}`, date, occurrence_date: date, series_id: sid, recurrence: agg.rule, detached: false },
    }));
    const { error: upErr } = await db.from("calendar_events").upsert(newRows);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    created += newRows.length;
    extended++;
  }

  return NextResponse.json({ ok: true, series: series.size, extended, created });
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
