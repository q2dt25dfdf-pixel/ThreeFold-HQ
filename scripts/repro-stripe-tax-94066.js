// Read-only reproduction of the Stripe Tax lookup behind quote TF-Q-2026-0006.
//
// Makes exactly two stripe.tax.calculations.create calls (no charge, no customer,
// no persisted side effects beyond Stripe's own transient calculation objects):
//   (a) ZIP-only 94066 — byte-identical to what resolveSalesTax sent on 2026-07-30
//   (b) the same calculation with a full San Bruno street address
// and prints the effective rate plus the LINE-ITEM jurisdiction breakdown
// (calc.line_items.data[].tax_breakdown[]) that the production code discards.
//
// The key is read from STRIPE_SECRET_KEY at runtime and never printed.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_... node scripts/repro-stripe-tax-94066.js [line1] [city]
//   (line1/city default to San Bruno City Hall: "567 El Camino Real", "San Bruno")

const Stripe = require("stripe");

const AMOUNT_CENTS = 37500; // $375.00 — Saed's discounted subtotal
const TAX_CODE = "txcd_99999999"; // General — Tangible Goods
const ZIP = "94066";

async function calculate(stripe, label, address) {
  const calc = await stripe.tax.calculations.create({
    currency: "usd",
    customer_details: { address, address_source: "shipping" },
    line_items: [{ amount: AMOUNT_CENTS, reference: "repro-quote-taxable", tax_behavior: "exclusive", tax_code: TAX_CODE }],
    expand: ["line_items.data.tax_breakdown"],
  });

  const taxCents = calc.tax_amount_exclusive;
  console.log(`\n══ ${label}`);
  console.log(`   address sent: ${JSON.stringify(address)}`);
  console.log(`   calculation id: ${calc.id} (expires ${calc.expires_at ? new Date(calc.expires_at * 1000).toISOString() : "n/a"})`);
  console.log(`   tax on $375.00: $${(taxCents / 100).toFixed(2)}  →  rate ${(taxCents / AMOUNT_CENTS * 100).toFixed(4)}%`);

  const items = calc.line_items?.data ?? [];
  for (const li of items) {
    for (const b of li.tax_breakdown ?? []) {
      const j = b.jurisdiction ?? {};
      const rd = b.tax_rate_details ?? {};
      console.log(
        `   - ${j.display_name ?? "?"} [${j.level ?? "?"}]  ` +
        `${rd.percentage_decimal ?? "?"}%  → $${((b.amount ?? 0) / 100).toFixed(2)}` +
        (b.taxability_reason ? `  (${b.taxability_reason})` : ""),
      );
    }
  }
  if (!items.length) console.log("   (no line items returned — unexpected)");
  return { taxCents, rate: taxCents / AMOUNT_CENTS };
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Provide it in the environment; it is never printed.");
    process.exit(1);
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const line1 = process.argv[2] ?? "567 El Camino Real";
  const city = process.argv[3] ?? "San Bruno";

  const a = await calculate(stripe, "(a) ZIP-ONLY — exact reproduction of the 2026-07-30 call",
    { postal_code: ZIP, state: "CA", country: "US" });
  const b = await calculate(stripe, "(b) FULL STREET ADDRESS",
    { line1, city, postal_code: ZIP, state: "CA", country: "US" });

  console.log(`\n══ VERDICT`);
  console.log(`   ZIP-only rate:      ${(a.rate * 100).toFixed(4)}%`);
  console.log(`   Full-address rate:  ${(b.rate * 100).toFixed(4)}%`);
  console.log(a.taxCents === b.taxCents
    ? "   Rates MATCH — the ZIP-only input was not the cause of the discrepancy."
    : "   Rates DIFFER — ZIP-only resolution changed the jurisdiction. Full address is the fix.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
