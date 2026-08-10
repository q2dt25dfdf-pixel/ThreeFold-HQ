"use client";

import type { RecurrenceRule, RecurrenceFreq } from "@/lib/recurrence";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Minimal recurrence editor: None / Daily / Weekly (chosen weekdays) / Monthly
// (on the start date's day). Optional end: never / on date / after N.
export default function RecurrencePicker({
  value,
  startDate,
  onChange,
}: {
  value: RecurrenceRule | null;
  startDate: string; // "YYYY-MM-DD", the series anchor (for weekly default + monthly day)
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  const freq: "none" | RecurrenceFreq = value?.freq ?? "none";
  const monthDay = startDate ? Number(startDate.slice(8, 10)) : undefined;
  const startWeekday = startDate ? new Date(`${startDate}T00:00:00Z`).getUTCDay() : new Date().getUTCDay();

  const setFreq = (f: "none" | RecurrenceFreq) => {
    if (f === "none") { onChange(null); return; }
    if (f === "weekly") onChange({ freq: "weekly", weekdays: value?.weekdays?.length ? value.weekdays : [startWeekday], until: value?.until ?? null, count: value?.count ?? null });
    else if (f === "monthly") onChange({ freq: "monthly", monthDay, until: value?.until ?? null, count: value?.count ?? null });
    else onChange({ freq: "daily", until: value?.until ?? null, count: value?.count ?? null });
  };

  const toggleWeekday = (wd: number) => {
    if (!value || value.freq !== "weekly") return;
    const set = new Set(value.weekdays ?? []);
    if (set.has(wd)) set.delete(wd); else set.add(wd);
    onChange({ ...value, weekdays: [...set].sort((a, b) => a - b) });
  };

  const endMode: "never" | "until" | "count" = value?.until ? "until" : value?.count ? "count" : "never";
  const setEndMode = (m: "never" | "until" | "count") => {
    if (!value) return;
    if (m === "never") onChange({ ...value, until: null, count: null });
    else if (m === "until") onChange({ ...value, until: startDate, count: null });
    else onChange({ ...value, until: null, count: 10 });
  };

  const sel = "rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={freq} onChange={(e) => setFreq(e.target.value as "none" | RecurrenceFreq)} className={sel} aria-label="Repeat">
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly on day {monthDay ?? "—"}</option>
        </select>
      </div>

      {value?.freq === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleWeekday(i)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${(value.weekdays ?? []).includes(i) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {d}
            </button>
          ))}
        </div>
      )}

      {value && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Ends</span>
          <select value={endMode} onChange={(e) => setEndMode(e.target.value as "never" | "until" | "count")} className={sel}>
            <option value="never">Never</option>
            <option value="until">On date</option>
            <option value="count">After N times</option>
          </select>
          {endMode === "until" && (
            <input type="date" value={value.until ?? ""} min={startDate} onChange={(e) => onChange({ ...value, until: e.target.value || null })} className={sel} />
          )}
          {endMode === "count" && (
            <input type="number" min={1} value={value.count ?? 1} onChange={(e) => onChange({ ...value, count: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${sel} w-20`} />
          )}
        </div>
      )}
    </div>
  );
}
