// Shared recurrence rule + date generation for calendar events and board tasks.
// Pure and dependency-free. Minimal v1 patterns: daily, weekly on chosen weekdays,
// monthly on a day-of-month (clamped to the last day of short months — never skips).
// Events materialize a horizon of instances; tasks generate the next on completion.
// All dates are UTC "YYYY-MM-DD" strings.

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  weekdays?: number[];      // 0..6 (Sun..Sat), used by "weekly"
  monthDay?: number;        // 1..31, used by "monthly" (clamped per month)
  until?: string | null;    // inclusive end date "YYYY-MM-DD"
  count?: number | null;    // max occurrences including the first
};

// ── date helpers (UTC, no timezone drift) ────────────────────────────────────
function parse(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}
function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1..12; day 0 of next month
}
export function addDays(dateStr: string, n: number): string {
  const { y, m, d } = parse(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export function weekdayOf(dateStr: string): number {
  const { y, m, d } = parse(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
// Clamp a target day-of-month to the last valid day (e.g. 31 → 28/29 in Feb).
export function clampMonthDay(y: number, m: number, monthDay: number): number {
  return Math.min(monthDay, daysInMonth(y, m));
}

// ── occurrence generation ────────────────────────────────────────────────────
// Occurrence dates on/after `startDate` that match the rule, bounded by the rule's
// until/count and the optional maxDate (horizon) / max (hard cap). The first item is
// the first pattern-match >= startDate.
export function occurrenceDates(
  rule: RecurrenceRule,
  startDate: string,
  opts: { maxDate?: string | null; max?: number } = {},
): string[] {
  const cap = opts.max ?? 366;
  const until = rule.until || null;
  const count = rule.count || null;
  const maxDate = opts.maxDate || null;
  const out: string[] = [];
  const stop = (date: string) => (until && date > until) || (maxDate && date > maxDate);

  if (rule.freq === "daily") {
    let cur = startDate;
    while (out.length < cap) {
      if (stop(cur)) break;
      out.push(cur);
      if (count && out.length >= count) break;
      cur = addDays(cur, 1);
    }
  } else if (rule.freq === "weekly") {
    const set = new Set(rule.weekdays?.length ? rule.weekdays : [weekdayOf(startDate)]);
    let cur = startDate;
    // Bound the day-by-day scan so an unbounded rule still terminates via cap.
    let guard = 0;
    while (out.length < cap && guard < cap * 7 + 14) {
      if (stop(cur)) break;
      if (set.has(weekdayOf(cur))) {
        out.push(cur);
        if (count && out.length >= count) break;
      }
      cur = addDays(cur, 1);
      guard++;
    }
  } else {
    // monthly on a day-of-month (clamped each month)
    const md = rule.monthDay ?? parse(startDate).d;
    let { y, m } = parse(startDate);
    while (out.length < cap) {
      const cand = fmt(y, m, clampMonthDay(y, m, md));
      if (cand >= startDate) {
        if (stop(cand)) break;
        out.push(cand);
        if (count && out.length >= count) break;
      }
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
  }
  return out;
}

// The next occurrence strictly after `afterDate` (used by tasks on completion).
// Respects `until`; ignores `count` (the caller enforces count via occurrence index).
// Returns null when the series has ended.
export function nextOccurrenceAfter(
  rule: RecurrenceRule,
  startDate: string,
  afterDate: string,
): string | null {
  const window = occurrenceDates({ ...rule, count: null }, startDate, {
    maxDate: addDays(afterDate, 400),
    max: 500,
  });
  const next = window.find((d) => d > afterDate);
  if (!next) return null;
  if (rule.until && next > rule.until) return null;
  return next;
}

export function describeRecurrence(rule: RecurrenceRule): string {
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (rule.freq === "daily") return "Daily";
  if (rule.freq === "weekly") {
    const days = (rule.weekdays?.length ? rule.weekdays : []).slice().sort((a, b) => a - b).map((d) => WD[d]);
    return days.length ? `Weekly on ${days.join(", ")}` : "Weekly";
  }
  return rule.monthDay ? `Monthly on day ${rule.monthDay}` : "Monthly";
}
