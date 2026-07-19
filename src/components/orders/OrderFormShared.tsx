"use client";

import { useMemo, useState } from "react";

export type LookupRecord = {
  id: string;
  name: string;
  company?: string;
};

export type OrderStatus =
  | "Production"
  | "Quality Check"
  | "Ready"
  | "Delivered"
  | "Cancelled";

export const itemOptions = [
  "T-Shirts",
  "Hoodies",
  "Long Sleeves",
  "Hats",
  "Jackets",
  "Tumblers",
  "Mugs",
  "Accessories",
  "Other",
];

export const statusOptions: OrderStatus[] = [
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
  "Cancelled",
];

export function centsToCurrency(cents: string): string {
  return (Number(cents || "0") / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function recordName(record: LookupRecord): string {
  return record.name || record.company || "";
}

export function handleCurrencyKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  setAmountCents: React.Dispatch<React.SetStateAction<string>>,
) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (["Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    setAmountCents((current) => current.slice(0, -1));
    return;
  }

  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    setAmountCents((current) => (current + event.key).replace(/^0+(?=\d)/, ""));
    return;
  }

  event.preventDefault();
}

// Reusable currency field: right-to-left cents entry (typing 1,2,3,4 -> $12.34), no
// leading zero, blank when empty (no stubborn "0"). Stores integer cents via onChangeCents.
// Model-agnostic — reuse on any dollar input later. Wraps the canonical centsToCurrency /
// handleCurrencyKeyDown helpers so all currency fields behave identically.
export function CurrencyInput({
  valueCents,
  onChangeCents,
  className,
  placeholder = "$0.00",
  ariaLabel,
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const digits = valueCents ? String(Math.max(0, Math.round(valueCents))) : "";
  const setDigits: React.Dispatch<React.SetStateAction<string>> = (action) => {
    const next = typeof action === "function" ? (action as (c: string) => string)(digits) : action;
    onChangeCents(Number(next || "0"));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={digits ? centsToCurrency(digits) : ""}
      onKeyDown={(e) => handleCurrencyKeyDown(e, setDigits)}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
        setDigits((c) => (c + pasted).replace(/^0+(?=\d)/, ""));
      }}
      onChange={() => {}}
    />
  );
}

export function SmartSearchInput({
  label,
  value,
  onChange,
  onSelect,
  records,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (record: LookupRecord) => void;
  records: LookupRecord[];
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const suggestions = useMemo(
    () =>
      records
        .filter((record) => {
          const name = recordName(record).toLowerCase();
          return normalizedValue.length > 0 && name.includes(normalizedValue);
        })
        .slice(0, 6),
    [normalizedValue, records],
  );
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">{label}</label>
      <input
        type="text"
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        placeholder={placeholder}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => onChange(event.target.value)}
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl">
          {suggestions.map((record) => {
            const name = recordName(record);
            return (
              <button
                key={record.id}
                type="button"
                className="block w-full px-4 py-3 text-left text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (onSelect) {
                    onSelect(record);
                  } else {
                    onChange(name);
                  }
                  setFocused(false);
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
