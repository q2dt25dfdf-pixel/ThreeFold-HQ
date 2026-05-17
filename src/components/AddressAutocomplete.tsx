"use client";

import { useEffect, useRef, useState } from "react";

type NominatimResult = {
  place_id: number;
  display_name: string;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  onBlur?: () => void;
  onSelect?: (value: string) => void;
  autoFocus?: boolean;
};

export default function AddressAutocomplete({ value, onChange, className = "", placeholder, onBlur, onSelect, autoFocus = false }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [focused, setFocused] = useState(false);
  const touchOnSuggestion = useRef(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      const timeout = window.setTimeout(() => setSuggestions([]), 0);
      return () => window.clearTimeout(timeout);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const results = (await response.json()) as NominatimResult[];
        setSuggestions(results.slice(0, 5));
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [value]);

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!touchOnSuggestion.current) setFocused(false);
            onBlur?.();
          }, 200);
        }}
        onChange={(event) => onChange(event.target.value)}
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
              onMouseDown={(event) => {
                event.preventDefault(); // desktop: prevents input from losing focus
              }}
              onTouchStart={() => { touchOnSuggestion.current = true; }}
              onTouchEnd={() => { touchOnSuggestion.current = false; }}
              onTouchCancel={() => { touchOnSuggestion.current = false; }}
              onClick={() => {
                onChange(suggestion.display_name);
                onSelect?.(suggestion.display_name);
                setSuggestions([]);
                setFocused(false);
                touchOnSuggestion.current = false;
              }}
            >
              {suggestion.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
