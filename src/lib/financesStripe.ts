import Stripe from "stripe";

// Stripe fees for the Finances net position — pulled from the BALANCE TRANSACTION
// history, not per-charge fee fields, so standalone "stripe_fee" rows (Stripe Tax /
// Stripe Billing charges) are captured alongside processing fees on charges and
// payments. Read with STRIPE_RESTRICTED_KEY only (a restricted key scoped to
// balance-transaction reads); this NEVER falls back to STRIPE_SECRET_KEY — the fee
// feature must not be a reason the full secret key exists in more environments.

// Pre-launch cutoff, passed as created.gte: three $0.52 test charges and a $0.50
// payment from May 2026 setup are noise, and their processing fees (~$1) would
// pollute the total. Fee accounting starts at business go-live, June 2026.
export const FEES_SINCE = "2026-06-01";

export type StripeFees = {
  // Integer cents throughout — no float math on money in this module.
  processingFees: number; // Σ txn.fee on charge/payment rows
  stripeFees: number; // Σ |txn.amount| on stripe_fee rows (Stripe Tax / Billing)
  total: number;
  available: boolean; // false when STRIPE_RESTRICTED_KEY is not configured
};

const UNAVAILABLE: StripeFees = { processingFees: 0, stripeFees: 0, total: 0, available: false };

/** Total Stripe fees since FEES_SINCE, in integer cents. Never throws for a missing
 *  key — local dev without the restricted key degrades to zeros + available:false. */
export async function fetchStripeFees(): Promise<StripeFees> {
  const key = process.env.STRIPE_RESTRICTED_KEY;
  if (!key) return UNAVAILABLE;

  const stripe = new Stripe(key);
  const createdGte = Math.floor(Date.parse(`${FEES_SINCE}T00:00:00Z`) / 1000);

  let processingFees = 0;
  let stripeFees = 0;
  // Auto-pagination walks the full history in 100-row pages (1 call at current volume).
  for await (const txn of stripe.balanceTransactions.list({ limit: 100, created: { gte: createdGte } })) {
    if (txn.type === "charge" || txn.type === "payment") {
      // Refund rows carry fee 0 and aren't of these types; Stripe keeps the original
      // processing fee on refund, so it stays counted here. That is correct.
      processingFees += txn.fee;
    } else if (txn.type === "stripe_fee") {
      stripeFees += Math.abs(txn.amount);
    }
  }

  return { processingFees, stripeFees, total: processingFees + stripeFees, available: true };
}
