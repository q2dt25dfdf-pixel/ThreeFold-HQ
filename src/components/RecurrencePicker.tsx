"use client";

import { useState } from "react";
import type { RecurrenceRule, RecurrenceFreq } from "@/lib/recurrence";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Apple-Calendar-style recurrence editor: a preset menu that only opens the detail
// builder on "Custom". Presets derive from the event's own date.
type Preset = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";

const dayOf = (s: string) => (s ? Number(s.slice(8, 10)) : 1);
const monthOf = (s: string) => (s ? Number(s.slice(5, 7)) : 1);
const weekdayOf = (s: string) => (s ? new Date(`${s}T00:00:00Z`).getUTCDay() : new Date().getUTCDay());

// Preset → rule, derived from the start date.
function presetRule(preset: Preset, startDate: string): RecurrenceRule | null {
  const wd = weekdayOf(startDate);
  switch (preset) {
    case "none": return null;
    case "daily": return { freq: "daily" };
    case "weekly": return { freq: "weekly", weekdays: [wd] };
    case "biweekly": return { freq: "weekly", interval: 2, weekdays: [wd] };
    case "monthly": return { freq: "monthly", monthDay: dayOf(startDate) };
    case "yearly": return { freq: "yearly", month: monthOf(startDate), monthDay: dayOf(startDate) };
    default: return null;
  }
}

// Which preset (if any) a rule represents — used to pick the menu value when editing.
// Anything with a custom end (until/count) or off-pattern shape is "custom".
function matchPreset(rule: RecurrenceRule | null, startDate: string): Preset {
  if (!rule) return "none";
  if (rule.until || rule.count) return "custom";
  const interval = rule.interval ?? 1;
  const wd = weekdayOf(startDate), day = dayOf(startDate), month = monthOf(startDate);
  if (rule.freq === "daily" && interval === 1) return "daily";
  if (rule.freq === "weekly" && rule.weekdays?.length === 1 && rule.weekdays[0] === wd) {
    if (interval === 1) return "weekly";
    if (interval === 2) return "biweekly";
  }
  if (rule.freq === "monthly" && interval === 1 && (rule.monthDay ?? day) === day) return "monthly";
  if (rule.freq === "yearly" && interval === 1 && (rule.month ?? month) === month && (rule.monthDay ?? day) === day) return "yearly";
  return "custom";
}

const sel = "rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm";

export default function RecurrencePicker({
  value,
  startDate,
  onChange,
}: {
  value: RecurrenceRule | null;
  startDate: string; // "YYYY-MM-DD", the series anchor
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  // Force the builder open when the founder explicitly picks Custom, even if the current
  // rule happens to match a preset.
  const [forceCustom, setForceCustom] = useState(false);
  const preset: Preset = forceCustom ? "custom" : matchPreset(value, startDate);

  const onPickPreset = (p: Preset) => {
    if (p === "custom") {
      setForceCustom(true);
      if (!value) onChange({ freq: "weekly", weekdays: [weekdayOf(startDate)] }); // seed a builder
    } else {
      setForceCustom(false);
      onChange(presetRule(p, startDate));
    }
  };

  return (
    <div className="space-y-2">
      <select value={preset} onChange={(e) => onPickPreset(e.target.value as Preset)} className={sel} aria-label="Repeat">
        <option value="none">Does not repeat</option>
        <option value="daily">Every Day</option>
        <option value="weekly">Every Week</option>
        <option value="biweekly">Every 2 Weeks</option>
        <option value="monthly">Every Month</option>
        <option value="yearly">Every Year</option>
        <option value="custom">Custom…</option>
      </select>

      {preset === "custom" && value && <CustomBuilder value={value} startDate={startDate} onChange={onChange} />}
    </div>
  );
}

// ── Custom detail builder: frequency + "every N" interval, weekday picker (weekly),
//    day-of-month (monthly), month + day (yearly), and end condition. ────────────────
function CustomBuilder({
  value,
  startDate,
  onChange,
}: {
  value: RecurrenceRule;
  startDate: string;
  onChange: (rule: RecurrenceRule) => void;
}) {
  const interval = value.interval ?? 1;
  const unit = value.freq === "daily" ? "day" : value.freq === "weekly" ? "week" : value.freq === "monthly" ? "month" : "year";

  const setFreq = (freq: RecurrenceFreq) => {
    const base = { interval: value.interval, until: value.until ?? null, count: value.count ?? null };
    if (freq === "daily") onChange({ freq: "daily", ...base });
    else if (freq === "weekly") onChange({ freq: "weekly", weekdays: value.weekdays?.length ? value.weekdays : [weekdayOf(startDate)], ...base });
    else if (freq === "monthly") onChange({ freq: "monthly", monthDay: value.monthDay ?? dayOf(startDate), ...base });
    else onChange({ freq: "yearly", month: value.month ?? monthOf(startDate), monthDay: value.monthDay ?? dayOf(startDate), ...base });
  };

  const toggleWeekday = (wd: number) => {
    const set = new Set(value.weekdays ?? []);
    if (set.has(wd)) set.delete(wd); else set.add(wd);
    onChange({ ...value, weekdays: [...set].sort((a, b) => a - b) });
  };

  const endMode: "never" | "until" | "count" = value.until ? "until" : value.count ? "count" : "never";
  const setEndMode = (m: "never" | "until" | "count") => {
    if (m === "never") onChange({ ...value, until: null, count: null });
    else if (m === "until") onChange({ ...value, until: startDate, count: null });
    else onChange({ ...value, until: null, count: 10 });
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      {/* Frequency + every-N interval */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500">Every</span>
        <input
          type="number" min={1} value={interval}
          onChange={(e) => onChange({ ...value, interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          className={`${sel} w-16`}
        />
        <select value={value.freq} onChange={(e) => setFreq(e.target.value as RecurrenceFreq)} className={sel}>
          <option value="daily">{interval === 1 ? "day" : "days"}</option>
          <option value="weekly">{interval === 1 ? "week" : "weeks"}</option>
          <option value="monthly">{interval === 1 ? "month" : "months"}</option>
          <option value="yearly">{interval === 1 ? "year" : "years"}</option>
        </select>
      </div>

      {value.freq === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggleWeekday(i)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${(value.weekdays ?? []).includes(i) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {d}
            </button>
          ))}
        </div>
      )}

      {value.freq === "monthly" && (
        <p className="text-[11px] text-slate-500">On day {value.monthDay ?? dayOf(startDate)} of the month (clamped to the last day in shorter months).</p>
      )}

      {value.freq === "yearly" && (
        <p className="text-[11px] text-slate-500">On {MONTHS[(value.month ?? monthOf(startDate)) - 1]} {value.monthDay ?? dayOf(startDate)} (Feb 29 falls on Feb 28 in non-leap years).</p>
      )}

      {/* End condition */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
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
    </div>
  );
}
