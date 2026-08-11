import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { occurrenceDates, type RecurrenceRule } from "@/lib/recurrence";

// POST /api/recurrence/events  (session-gated)
// Owns recurring calendar_events series. Occurrences are REAL rows (id
// "<series_id>::<date>", carrying series_id + recurrence + occurrence_date +
// detached), so the Calendar's date-keyed reads need no changes.
//
// Body (discriminated by action):
//   { action: "create", template, rule, startDate }         → materialize a horizon
//   { action: "update-series", series_id, fromDate, patch }  → patch future non-detached
//   { action: "delete-series", series_id, fromDate }         → delete this + future

const HORIZON_DAYS = 120;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function horizonEnd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

type EventTemplate = Record<string, unknown>;

function buildOccurrenceRows(seriesId: string, template: EventTemplate, rule: RecurrenceRule, dates: string[]) {
  return dates.map((date) => ({
    id: `${seriesId}::${date}`,
    data: {
      ...template,
      id: `${seriesId}::${date}`,
      date,
      occurrence_date: date,
      series_id: seriesId,
      recurrence: rule,
      detached: false,
    },
  }));
}

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: {
    action?: string;
    template?: EventTemplate;
    rule?: RecurrenceRule;
    startDate?: string;
    series_id?: string;
    fromDate?: string;
    patch?: Record<string, unknown>;
  };
  try { body = await request.json(); } catch { body = {}; }
  const db = getSupabaseAdmin();

  if (body.action === "create") {
    const { template, rule, startDate } = body;
    if (!template || !rule || !startDate) {
      return NextResponse.json({ error: "template, rule and startDate are required." }, { status: 400 });
    }
    const seriesId = `evseries-${Date.now()}`;
    const dates = occurrenceDates(rule, startDate, { maxDate: horizonEnd() });
    if (!dates.length) return NextResponse.json({ error: "The rule produces no occurrences." }, { status: 400 });
    const rows = buildOccurrenceRows(seriesId, template, rule, dates);
    const { error } = await db.from("calendar_events").upsert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, series_id: seriesId, created: rows.length });
  }

  if (body.action === "update-series") {
    const { series_id, patch } = body;
    const fromDate = body.fromDate || todayISO();
    if (!series_id || !patch) return NextResponse.json({ error: "series_id and patch are required." }, { status: 400 });
    const { data: rows, error } = await db.from("calendar_events").select("id, data").eq("data->>series_id", series_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Pattern change: `rule` present → REGENERATE future non-detached occurrences ──
    // Past occurrences (< fromDate) are history, untouched. Detached occurrences survive
    // and are never regenerated; if the new pattern lands on a date a detached one already
    // holds, that date is skipped (no duplicate). Guarded so a rule with zero future
    // occurrences is rejected BEFORE anything is deleted.
    if (body.rule) {
      const rule = body.rule;
      const detachedDates = new Set<string>();
      const futureNonDetachedIds: string[] = [];
      let base: Record<string, unknown> | null = null;
      for (const r of rows ?? []) {
        const d = r.data as Record<string, unknown>;
        const od = String(d.occurrence_date ?? d.date ?? "");
        if (d.detached === true) { detachedDates.add(od); continue; }
        if (od === fromDate) base = d;
        if (od >= fromDate) futureNonDetachedIds.push(r.id);
      }
      if (!base) base = ((rows ?? [])[0]?.data as Record<string, unknown>) ?? {};
      const template = { ...base, ...patch };
      const dates = occurrenceDates(rule, fromDate, { maxDate: horizonEnd() }).filter((dt) => !detachedDates.has(dt));
      if (!dates.length) return NextResponse.json({ error: "The new pattern produces no occurrences from this date." }, { status: 400 });

      if (futureNonDetachedIds.length) {
        const { error: delErr } = await db.from("calendar_events").delete().in("id", futureNonDetachedIds);
        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      const newRows = buildOccurrenceRows(series_id, template, rule, dates);
      const { error: upErr } = await db.from("calendar_events").upsert(newRows);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, regenerated: newRows.length, deleted_future: futureNonDetachedIds.length, detached_kept: detachedDates.size });
    }

    // ── Field patch (no pattern change): update shared fields on this + future non-detached ──
    let updated = 0;
    for (const r of rows ?? []) {
      const d = r.data as Record<string, unknown>;
      if (d.detached === true) continue;
      if (String(d.occurrence_date ?? d.date ?? "") < fromDate) continue;
      const merged = { ...d, ...patch, id: r.id, series_id, occurrence_date: d.occurrence_date, date: d.occurrence_date ?? d.date };
      const { error: upErr } = await db.from("calendar_events").update({ data: merged }).eq("id", r.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      updated++;
    }
    return NextResponse.json({ ok: true, updated });
  }

  if (body.action === "delete-series") {
    const { series_id } = body;
    const fromDate = body.fromDate || todayISO();
    if (!series_id) return NextResponse.json({ error: "series_id is required." }, { status: 400 });
    const { data: rows, error } = await db.from("calendar_events").select("id, data").eq("data->>series_id", series_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const toDelete = (rows ?? []).filter((r) => String((r.data as Record<string, unknown>).occurrence_date ?? (r.data as Record<string, unknown>).date ?? "") >= fromDate).map((r) => r.id);
    if (toDelete.length) {
      const { error: delErr } = await db.from("calendar_events").delete().in("id", toDelete);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deleted: toDelete.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
