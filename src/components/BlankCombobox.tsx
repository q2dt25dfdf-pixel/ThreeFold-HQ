"use client";

import { useMemo, useState } from "react";

// Free-text combobox for the line-item "Blank" field. Suggestions filter by
// CONTAINS-anywhere (case-insensitive), not prefix, and typing anything is allowed —
// the value is always whatever the founder types (blanks not in inventory still work).
export default function BlankCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    // Drop an option identical to what's already typed (nothing to pick), cap the list.
    return matches.filter((o) => o.toLowerCase() !== q).slice(0, 50);
  }, [value, options]);

  const base =
    "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm";

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className={className ?? base}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 md:text-sm"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
