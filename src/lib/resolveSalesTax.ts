// Sales-tax RATE resolver (server-only). Option 2: HQ stays the source of truth for the
// charged total; this only decides the RATE that gets baked into HQ's own total at quote
// creation. It uses Stripe Tax (stripe.tax.calculations.create) as a rate lookup ONLY -
// automatic_tax at checkout stays OFF and the checkout routes are untouched. On ANY problem
// (no ZIP, Stripe error/timeout, or Stripe returns an unusable/zero tax) it FALLS BACK to the
// hand-maintained CA ZIP table (getSalesTaxRateForAddress) so quote generation can never break
// or hang. Returns the same shape the ZIP table returns so the two creation call sites and all
// stored fields are unchanged - only tax_rate_source changes ("stripe" | "fallback").

import { getStripe } from "./stripe";
import { getSalesTaxRateForAddress, type TaxRateResult } from "./tax-rates";

// One per-jurisdiction line from Stripe's LINE-ITEM tax_breakdown (the top-level
// calculation breakdown has no jurisdiction object — only the line-item one does).
// Stored on the quote for audit so a rate discrepancy is answerable after the fact.
export type TaxBreakdownEntry = {
  jurisdiction: string;
  level: string; // "state" | "county" | "city" | "district"
  percentage_decimal: string | null;
  amount_cents: number;
  taxability_reason: string | null;
};

export type ResolvedTax = {
  rate: number;
  source: string; // "stripe" | "fallback"
  jurisdictionLabel: string;
  zipUsed?: string;
  warning: string | null;
  calculationId: string | null; // Stripe tax calculation id ("stripe" only)
  breakdown: TaxBreakdownEntry[] | null; // per-jurisdiction lines ("stripe" only)
};

// Cap the Stripe call so a slow/hung request can never stall quote creation.
const STRIPE_TAX_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stripe tax timeout")), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// First 5-digit ZIP found in free text (e.g. "123 Main St, Sunnyvale, CA 94086").
function zipFromText(text?: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : undefined;
}

export async function resolveSalesTax({
  deliveryZip,
  clientZip,
  clientAddressText,
  line1,
  city,
  taxableAmountCents,
}: {
  deliveryZip?: string;
  clientZip?: string;
  clientAddressText?: string;
  line1?: string;
  city?: string;
  taxableAmountCents: number;
}): Promise<ResolvedTax> {
  // The permanent safety net: the existing CA ZIP table. Marked "fallback" so the stored
  // tax_rate_source reflects that Stripe was not the authority for this quote.
  const fallback = (): ResolvedTax => {
    const r: TaxRateResult = getSalesTaxRateForAddress({ deliveryZip, clientZip, clientAddressText });
    return {
      rate: r.rate,
      source: "fallback",
      jurisdictionLabel: r.jurisdictionLabel,
      zipUsed: r.zipUsed,
      warning: r.warning ?? null,
      calculationId: null,
      breakdown: null,
    };
  };

  const bestZip = (deliveryZip || clientZip || zipFromText(clientAddressText) || "").trim();
  // No ZIP or nothing to tax -> can't ask Stripe meaningfully; use the table.
  if (!bestZip || !Number.isFinite(taxableAmountCents) || taxableAmountCents <= 0) {
    return fallback();
  }

  try {
    const stripe = getStripe();
    const calc = await withTimeout(
      stripe.tax.calculations.create({
        currency: "usd",
        customer_details: {
          address: {
            postal_code: bestZip,
            state: "CA",
            country: "US",
            ...(line1 ? { line1 } : {}),
            ...(city ? { city } : {}),
          },
          address_source: "shipping",
        },
        line_items: [
          {
            amount: Math.round(taxableAmountCents), // taxable base in cents, tax added on top
            reference: "quote-taxable",
            tax_behavior: "exclusive",
            tax_code: "txcd_99999999", // General - Tangible Goods
          },
        ],
        // Jurisdictions live on the LINE-ITEM breakdown only; the top-level
        // calculation tax_breakdown carries rates without jurisdiction names.
        expand: ["line_items.data.tax_breakdown"],
      }),
      STRIPE_TAX_TIMEOUT_MS,
    );

    const taxCents = calc.tax_amount_exclusive;
    // Stripe returned nothing usable (e.g. no registration hit for this jurisdiction) -> table.
    if (!Number.isFinite(taxCents) || taxCents <= 0) {
      return fallback();
    }

    const rate = taxCents / taxableAmountCents;
    type LineBreakdown = {
      amount?: number;
      jurisdiction?: { display_name?: string; level?: string };
      tax_rate_details?: { percentage_decimal?: string };
      taxability_reason?: string;
    };
    const rawBreakdown = (calc.line_items?.data?.[0]?.tax_breakdown ?? []) as LineBreakdown[];
    const breakdown: TaxBreakdownEntry[] = rawBreakdown.map((b) => ({
      jurisdiction: b.jurisdiction?.display_name ?? "",
      level: b.jurisdiction?.level ?? "",
      percentage_decimal: b.tax_rate_details?.percentage_decimal ?? null,
      amount_cents: Number(b.amount ?? 0),
      taxability_reason: b.taxability_reason ?? null,
    }));
    // Label from the most specific collecting jurisdiction (city > county > state).
    const byLevel = (level: string) =>
      breakdown.find((b) => b.level === level && b.jurisdiction)?.jurisdiction;
    const jurisdictionName = byLevel("city") ?? byLevel("county") ?? byLevel("state");

    return {
      rate,
      source: "stripe",
      jurisdictionLabel: jurisdictionName ? `${jurisdictionName}, CA (Stripe Tax)` : `Stripe Tax (${bestZip}, CA)`,
      zipUsed: bestZip,
      warning: null,
      calculationId: (calc.id as string | undefined) ?? null,
      breakdown: breakdown.length > 0 ? breakdown : null,
    };
  } catch {
    // Any Stripe error or the 4s timeout -> never break quote generation.
    return fallback();
  }
}
