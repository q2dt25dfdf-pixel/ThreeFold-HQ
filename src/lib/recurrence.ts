// Shared recurrence rule + date generation for calendar events and board tasks.
// Pure and dependency-free. Minimal v1 patterns: daily, weekly on chosen weekdays,
// monthly on a day-of-month (clamped to the last day of short months — never skips).
// Events materialize a horizon of instances; tasks generate the next on completion.
// All dates are UTC "YYYY-MM-DD" strings.

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval?: number;        // "every N" (default 1): N days / weeks / months / years
  weekdays?: number[];      // 0..6 (Sun..Sat), used by "weekly"
  monthDay?: number;        // 1..31, used by "monthly" + "yearly" (clamped per month)
  month?: number;           // 1..12, used by "yearly" (the month to fire in)
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
// Sunday that starts the week containing dateStr, and whole-weeks between two Sundays.
function weekStart(dateStr: string): string {
  return addDays(dateStr, -weekdayOf(dateStr));
}
function weeksBetween(aSunday: string, bSunday: string): number {
  const a = Date.parse(`${aSunday}T00:00:00Z`);
  const b = Date.parse(`${bSunday}T00:00:00Z`);
  return Math.round((b - a) / (7 * 24 * 3600 * 1000));
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
  const interval = Math.max(1, Math.floor(rule.interval ?? 1)); // "every N"
  const out: string[] = [];
  const stop = (date: string) => (until && date > until) || (maxDate && date > maxDate);

  if (rule.freq === "daily") {
    let cur = startDate;
    while (out.length < cap) {
      if (stop(cur)) break;
      out.push(cur);
      if (count && out.length >= count) break;
      cur = addDays(cur, interval); // every N days
    }
  } else if (rule.freq === "weekly") {
    const set = new Set(rule.weekdays?.length ? rule.weekdays : [weekdayOf(startDate)]);
    const anchor = weekStart(startDate); // interval counts whole weeks from here
    let cur = startDate;
    // Bound the day-by-day scan so an unbounded rule still terminates via cap. Occurrences
    // are up to `interval` weeks apart, so the scan span scales with interval.
    let guard = 0;
    const guardMax = cap * 7 * interval + 14;
    while (out.length < cap && guard < guardMax) {
      if (stop(cur)) break;
      // Every N weeks: only weeks whose offset from the anchor is a multiple of N.
      if (set.has(weekdayOf(cur)) && weeksBetween(anchor, weekStart(cur)) % interval === 0) {
        out.push(cur);
        if (count && out.length >= count) break;
      }
      cur = addDays(cur, 1);
      guard++;
    }
  } else if (rule.freq === "yearly") {
    // Same month + day each year; Feb 29 clamps to Feb 28 in non-leap years (like monthly).
    const month = rule.month ?? parse(startDate).m;
    const md = rule.monthDay ?? parse(startDate).d;
    let { y } = parse(startDate);
    while (out.length < cap) {
      const cand = fmt(y, month, clampMonthDay(y, month, md));
      if (cand >= startDate) {
        if (stop(cand)) break;
        out.push(cand);
        if (count && out.length >= count) break;
      }
      y += interval; // every N years
    }
  } else {
    // monthly on a day-of-month (clamped each month), every N months
    const md = rule.monthDay ?? parse(startDate).d;
    let { y, m } = parse(startDate);
    while (out.length < cap) {
      const cand = fmt(y, m, clampMonthDay(y, m, md));
      if (cand >= startDate) {
        if (stop(cand)) break;
        out.push(cand);
        if (count && out.length >= count) break;
      }
      m += interval;
      while (m > 12) { m -= 12; y += 1; }
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
  const MO = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const n = Math.max(1, Math.floor(rule.interval ?? 1));
  const every = (unit: string) => (n === 1 ? "" : `Every ${n} ${unit}s`); // "" ⇒ use the simple label

  if (rule.freq === "daily") return n === 1 ? "Daily" : `Every ${n} days`;
  if (rule.freq === "weekly") {
    const days = (rule.weekdays?.length ? rule.weekdays : []).slice().sort((a, b) => a - b).map((d) => WD[d]);
    const on = days.length ? ` on ${days.join(", ")}` : "";
    return (every("week") || "Weekly") + on;
  }
  if (rule.freq === "yearly") {
    const mo = MO[rule.month ?? 0];
    const on = mo && rule.monthDay ? ` on ${mo} ${rule.monthDay}` : "";
    return (every("year") || "Yearly") + on;
  }
  const on = rule.monthDay ? ` on day ${rule.monthDay}` : "";
  return (every("month") || "Monthly") + on;
}
