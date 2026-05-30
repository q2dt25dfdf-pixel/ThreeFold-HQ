// California Sales Tax Rate Lookup — ZIP-based
//
// Source: CA CDTFA rate database (manual lookup, effective 2026).
// Verify current rates at: https://www.cdtfa.ca.gov/taxes-and-fees/rates.aspx
//
// Rates are decimal fractions (0.1025 = 10.25%).
//
// HOW TO ADD A CITY:
//   1. Look up the current combined rate at the CDTFA link above.
//   2. Find its ZIP codes via usps.com or the CDTFA rate lookup tool.
//   3. Add entries to CA_ZIP_RATES below, grouped by county section.
//   4. Entries marked // VERIFY should be confirmed against CDTFA before relying on them.

export const DEFAULT_CA_TAX_RATE = 0.09375;

const FALLBACK_WARNING =
  "Fallback 9.375% sales tax rate used because ZIP was missing or unrecognized.";

export type TaxRateSource =
  | "delivery_address"
  | "client_address"
  | "address_text"
  | "fallback";

export type TaxRateResult = {
  rate: number;
  source: TaxRateSource;
  jurisdictionLabel: string;
  zipUsed?: string;
  warning?: string;
};

type ZipEntry = { rate: number; city: string; county: string };

// ── ZIP → rate table ──────────────────────────────────────────────────────────

const CA_ZIP_RATES: Record<string, ZipEntry> = {

  // ── Santa Clara County ────────────────────────────────────────────────────
  // County base: 9.125%  |  Cities below have additional district measures.

  // Milpitas — 9.375% (Measure T +0.25%)
  "95035": { rate: 0.09375, city: "Milpitas",      county: "Santa Clara" },

  // San Jose — 9.375% (Measure E +0.25%)
  "95101": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95110": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95111": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95112": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95113": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95116": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95117": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95118": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95119": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95120": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95121": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95122": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95123": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95124": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95125": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95126": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95127": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95128": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95129": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95130": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95131": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95132": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95133": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95134": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95135": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95136": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95138": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95139": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },
  "95148": { rate: 0.09375, city: "San Jose",      county: "Santa Clara" },

  // Santa Clara (city) — 9.125%
  "95050": { rate: 0.09125, city: "Santa Clara",   county: "Santa Clara" },
  "95051": { rate: 0.09125, city: "Santa Clara",   county: "Santa Clara" },
  "95052": { rate: 0.09125, city: "Santa Clara",   county: "Santa Clara" },
  "95054": { rate: 0.09125, city: "Santa Clara",   county: "Santa Clara" },

  // Sunnyvale — 9.125%
  "94085": { rate: 0.09125, city: "Sunnyvale",     county: "Santa Clara" },
  "94086": { rate: 0.09125, city: "Sunnyvale",     county: "Santa Clara" },
  "94087": { rate: 0.09125, city: "Sunnyvale",     county: "Santa Clara" },
  "94089": { rate: 0.09125, city: "Sunnyvale",     county: "Santa Clara" },

  // Cupertino — 9.125%
  "95014": { rate: 0.09125, city: "Cupertino",     county: "Santa Clara" },

  // Mountain View — 9.125%
  "94040": { rate: 0.09125, city: "Mountain View", county: "Santa Clara" },
  "94041": { rate: 0.09125, city: "Mountain View", county: "Santa Clara" },
  "94043": { rate: 0.09125, city: "Mountain View", county: "Santa Clara" },

  // Palo Alto — 9.125%
  "94301": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },
  "94302": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },
  "94303": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },
  "94304": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },
  "94305": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },
  "94306": { rate: 0.09125, city: "Palo Alto",     county: "Santa Clara" },

  // Campbell — 9.375% (Measure O +0.25%) // VERIFY
  "95008": { rate: 0.09375, city: "Campbell",      county: "Santa Clara" },
  "95009": { rate: 0.09375, city: "Campbell",      county: "Santa Clara" },

  // Los Gatos — 9.125% // VERIFY
  "95030": { rate: 0.09125, city: "Los Gatos",     county: "Santa Clara" },
  "95032": { rate: 0.09125, city: "Los Gatos",     county: "Santa Clara" },

  // Morgan Hill — 9.125% // VERIFY
  "95037": { rate: 0.09125, city: "Morgan Hill",   county: "Santa Clara" },
  "95038": { rate: 0.09125, city: "Morgan Hill",   county: "Santa Clara" },

  // Gilroy — 9.125% // VERIFY
  "95020": { rate: 0.09125, city: "Gilroy",        county: "Santa Clara" },
  "95021": { rate: 0.09125, city: "Gilroy",        county: "Santa Clara" },

  // ── Alameda County ────────────────────────────────────────────────────────
  // County base is higher than Santa Clara due to BART + multiple county measures.
  // Most incorporated cities in Alameda County are at or above 10.25%.

  // Fremont — 10.25%
  "94536": { rate: 0.1025,  city: "Fremont",       county: "Alameda" },
  "94537": { rate: 0.1025,  city: "Fremont",       county: "Alameda" },
  "94538": { rate: 0.1025,  city: "Fremont",       county: "Alameda" },
  "94539": { rate: 0.1025,  city: "Fremont",       county: "Alameda" },
  "94555": { rate: 0.1025,  city: "Fremont",       county: "Alameda" },

  // Newark — 10.25%
  "94560": { rate: 0.1025,  city: "Newark",        county: "Alameda" },

  // Union City — 10.25% // VERIFY
  "94587": { rate: 0.1025,  city: "Union City",    county: "Alameda" },

  // Hayward — 10.25% // VERIFY (some measures may push this to 10.75%; confirm on CDTFA)
  "94541": { rate: 0.1025,  city: "Hayward",       county: "Alameda" },
  "94542": { rate: 0.1025,  city: "Hayward",       county: "Alameda" },
  "94543": { rate: 0.1025,  city: "Hayward",       county: "Alameda" },
  "94544": { rate: 0.1025,  city: "Hayward",       county: "Alameda" },
  "94545": { rate: 0.1025,  city: "Hayward",       county: "Alameda" },

  // Oakland — 10.25% // VERIFY
  "94601": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94602": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94603": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94605": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94606": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94607": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94608": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94609": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94610": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94611": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94612": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94613": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94618": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94619": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },
  "94621": { rate: 0.1025,  city: "Oakland",       county: "Alameda" },

  // Berkeley — 10.25% // VERIFY
  "94701": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94702": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94703": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94704": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94705": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94706": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94707": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94708": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94709": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94710": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },
  "94720": { rate: 0.1025,  city: "Berkeley",      county: "Alameda" },

  // Pleasanton — 10.25% // VERIFY
  "94566": { rate: 0.1025,  city: "Pleasanton",    county: "Alameda" },
  "94588": { rate: 0.1025,  city: "Pleasanton",    county: "Alameda" },

  // Dublin — 10.25% // VERIFY
  "94568": { rate: 0.1025,  city: "Dublin",        county: "Alameda" },

  // Livermore — 10.25% // VERIFY
  "94550": { rate: 0.1025,  city: "Livermore",     county: "Alameda" },
  "94551": { rate: 0.1025,  city: "Livermore",     county: "Alameda" },

  // ── San Mateo County ──────────────────────────────────────────────────────
  // County base: ~9.375%.  Individual city measures may push rates higher.
  // Rates below use the county base as a conservative estimate — VERIFY each city.

  // Redwood City — 9.375% // VERIFY (city measure may increase this)
  "94061": { rate: 0.09375, city: "Redwood City",  county: "San Mateo" },
  "94062": { rate: 0.09375, city: "Redwood City",  county: "San Mateo" },
  "94063": { rate: 0.09375, city: "Redwood City",  county: "San Mateo" },
  "94064": { rate: 0.09375, city: "Redwood City",  county: "San Mateo" },
  "94065": { rate: 0.09375, city: "Redwood City",  county: "San Mateo" },

  // San Mateo (city) — 9.375% // VERIFY
  "94401": { rate: 0.09375, city: "San Mateo",     county: "San Mateo" },
  "94402": { rate: 0.09375, city: "San Mateo",     county: "San Mateo" },
  "94403": { rate: 0.09375, city: "San Mateo",     county: "San Mateo" },
  "94404": { rate: 0.09375, city: "San Mateo",     county: "San Mateo" },

  // Burlingame — 9.375% // VERIFY
  "94010": { rate: 0.09375, city: "Burlingame",    county: "San Mateo" },
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function lookupByZip(rawZip: string): (ZipEntry & { zip: string }) | null {
  const zip = rawZip.trim().replace(/\D/g, "").slice(0, 5);
  if (zip.length !== 5) return null;
  const entry = CA_ZIP_RATES[zip];
  if (!entry) return null;
  return { ...entry, zip };
}

function zipFromText(text: string): string | null {
  const match = text.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Direct ZIP lookup.  Useful for one-off checks and testing.
 *  Returns fallback result (with warning) when the ZIP is unrecognized. */
export function getSalesTaxRateForZip(rawZip: string): TaxRateResult {
  const found = lookupByZip(rawZip);
  if (found) {
    return {
      rate: found.rate,
      source: "delivery_address",
      jurisdictionLabel: `${found.city}, CA`,
      zipUsed: found.zip,
    };
  }
  const zip = rawZip.trim().replace(/\D/g, "").slice(0, 5);
  return {
    rate: DEFAULT_CA_TAX_RATE,
    source: "fallback",
    jurisdictionLabel: "Bay Area, CA (default)",
    zipUsed: zip.length === 5 ? zip : undefined,
    warning: FALLBACK_WARNING,
  };
}

/** Priority-chain address lookup used during quote generation.
 *
 *  Priority order:
 *  1. deliveryZip  (order delivery address)
 *  2. clientZip    (client / business address)
 *  3. clientAddressText  (parse a ZIP from a flat address string)
 *  4. Fallback: DEFAULT_CA_TAX_RATE (9.375%)
 */
export function getSalesTaxRateForAddress({
  deliveryZip,
  clientZip,
  clientAddressText,
}: {
  deliveryZip?: string;
  clientZip?: string;
  clientAddressText?: string;
}): TaxRateResult {
  if (deliveryZip) {
    const found = lookupByZip(deliveryZip);
    if (found) return { rate: found.rate, source: "delivery_address", jurisdictionLabel: `${found.city}, CA`, zipUsed: found.zip };
  }

  if (clientZip) {
    const found = lookupByZip(clientZip);
    if (found) return { rate: found.rate, source: "client_address", jurisdictionLabel: `${found.city}, CA`, zipUsed: found.zip };
  }

  if (clientAddressText) {
    const raw = zipFromText(clientAddressText);
    if (raw) {
      const found = lookupByZip(raw);
      if (found) return { rate: found.rate, source: "address_text", jurisdictionLabel: `${found.city}, CA`, zipUsed: found.zip };
    }
  }

  const hasAnyAddress = deliveryZip ?? clientZip ?? clientAddressText;
  return {
    rate: DEFAULT_CA_TAX_RATE,
    source: "fallback",
    jurisdictionLabel: "Bay Area, CA (default)",
    warning: hasAnyAddress
      ? FALLBACK_WARNING
      : "Fallback 9.375% sales tax rate used because no address was available.",
  };
}
