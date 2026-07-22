"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// Public shape is UNCHANGED from the previous Nominatim implementation so every caller keeps
// working: same props (value / onChange / onSelect / onSelectStructured / className /
// placeholder / onBlur / autoFocus) and the same StructuredAddress fields.
export type StructuredAddress = {
  display_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  onBlur?: () => void;
  onSelect?: (value: string) => void;
  /** When provided, fires on suggestion selection instead of onSelect. The caller receives the
   *  structured parts (incl. a US ZIP) AND should update its address field using display_name. */
  onSelectStructured?: (structured: StructuredAddress) => void;
  autoFocus?: boolean;
};

// A minimal row for our own dropdown: display label + the Google prediction to expand on select.
type Prediction = { id: string; label: string; source: google.maps.places.PlacePrediction };

// Load the Places library exactly once across all instances on the page.
let placesPromise: Promise<google.maps.PlacesLibrary> | null = null;
let warnedMissingKey = false;

function loadPlaces(): Promise<google.maps.PlacesLibrary> | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        "[AddressAutocomplete] NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is missing. Falling back to a plain text input (address entry still works, no suggestions).",
      );
    }
    return null;
  }
  if (!placesPromise) {
    setOptions({ key: apiKey, v: "weekly" });
    placesPromise = importLibrary("places");
  }
  return placesPromise;
}

export default function AddressAutocomplete({
  value,
  onChange,
  className = "",
  placeholder,
  onBlur,
  onSelect,
  onSelectStructured,
  autoFocus = false,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Prediction[]>([]);
  const [focused, setFocused] = useState(false);
  const touchOnSuggestion = useRef(false);
  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Load the Places library once (no-op / plain input when the key is missing).
  useEffect(() => {
    let active = true;
    const p = loadPlaces();
    if (p) {
      p.then((lib) => { if (active) placesRef.current = lib; }).catch(() => {});
    }
    return () => { active = false; };
  }, []);

  // Debounced as-you-type suggestions (min 3 chars), mirroring the previous UX.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(async () => {
      const lib = placesRef.current;
      if (!lib) {
        setSuggestions([]);
        return;
      }
      try {
        if (!sessionTokenRef.current) sessionTokenRef.current = new lib.AutocompleteSessionToken();
        const { suggestions: results } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ["us"],
        });
        setSuggestions(
          (results ?? [])
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => Boolean(p))
            .slice(0, 5)
            .map((p) => ({ id: p.placeId, label: p.text.text, source: p })),
        );
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [value]);

  const showSuggestions = focused && suggestions.length > 0;

  const handleSelectSuggestion = async (pred: Prediction) => {
    setSuggestions([]);
    setFocused(false);
    touchOnSuggestion.current = false;
    try {
      const place = pred.source.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "addressComponents"] });
      // formattedAddress includes the ZIP (e.g. "123 Main St, Sunnyvale, CA 94086, USA"), so the
      // plain onChange/onSelect text still contains the ZIP that zipFromText() reads for tax.
      const formatted = place.formattedAddress ?? pred.label;
      if (onSelectStructured) {
        const comps = place.addressComponents ?? [];
        const part = (type: string, useShort = false) => {
          const c = comps.find((x) => x.types.includes(type));
          return (c ? (useShort ? c.shortText : c.longText) : "") ?? "";
        };
        onSelectStructured({
          display_name: formatted,
          address_line1: [part("street_number"), part("route")].filter(Boolean).join(" "),
          city: part("locality") || part("postal_town") || part("sublocality") || part("administrative_area_level_2"),
          state: part("administrative_area_level_1", true),
          zip: part("postal_code"),
          country: part("country"),
        });
      } else {
        onChange(formatted);
        onSelect?.(formatted);
      }
    } catch {
      // Details lookup failed: fall back to the prediction label so selection still works.
      if (!onSelectStructured) {
        onChange(pred.label);
        onSelect?.(pred.label);
      }
    } finally {
      // End the billing session; a new token starts on the next keystroke.
      sessionTokenRef.current = null;
    }
  };

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
              key={suggestion.id}
              type="button"
              className="block w-full px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onTouchStart={() => { touchOnSuggestion.current = true; }}
              onTouchEnd={() => { touchOnSuggestion.current = false; }}
              onTouchCancel={() => { touchOnSuggestion.current = false; }}
              onClick={() => void handleSelectSuggestion(suggestion)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
