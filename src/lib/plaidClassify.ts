import { amountToCents, type PlaidTxn } from "@/lib/plaid";

// ── Staged transaction model ─────────────────────────────────────────────────
// One row per Plaid transaction in plaid_transactions. Kept in sync via the
// cursor API; reviewed on the Finances tab.
export type StagedStatus = "unreviewed" | "filed" | "dismissed" | "removed";

export type StagedTxn = {
  id: string;
  pending_transaction_id: string | null;
  account_id: string;
  account_name: string;
  account_mask: string;
  merchant_name: string;
  name: string;
  amount_cents: number; // >0 outflow (expense candidate), <0 inflow (income)
  direction: "out" | "in";
  txn_date: string; // ISO date
  pending: boolean;
  iso_currency_code: string;
  pfc_primary: string;
  pfc_detail: string;
  status: StagedStatus;
  auto_dismissed: boolean;
  dismiss_reason?: string;
  filed_expense_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

// Map a raw Plaid transaction onto our staged shape. Account display fields are
// passed in (resolved once per sync from the accounts list).
export function mapPlaidTxn(
  t: PlaidTxn,
  account: { name: string; mask: string },
  nowIso: string,
): Omit<StagedTxn, "status" | "auto_dismissed" | "dismiss_reason"> {
  const cents = amountToCents(t.amount);
  return {
    id: t.transaction_id,
    pending_transaction_id: t.pending_transaction_id ?? null,
    account_id: t.account_id,
    account_name: account.name,
    account_mask: account.mask,
    merchant_name: t.merchant_name || t.name,
    name: t.name,
    amount_cents: cents,
    direction: cents >= 0 ? "out" : "in",
    txn_date: t.authorized_date || t.date,
    pending: Boolean(t.pending),
    iso_currency_code: t.iso_currency_code || "USD",
    pfc_primary: t.personal_finance_category?.primary ?? "",
    pfc_detail: t.personal_finance_category?.detailed ?? "",
    created_at: nowIso,
    updated_at: nowIso,
  };
}

// ── Seed auto-dismiss rules (hardcoded — Phase 2 makes these editable) ────────
// Everything auto-dismissed stays visible under the "Dismissed" filter; nothing
// is deleted. PHASE 2 PLUGS IN HERE: replace these hardcoded checks with editable
// rules + merchant memory. No other file in the sync pipeline needs to change.
type DismissRule = { reason: string; test: (t: { direction: string; pfc_primary: string; pfc_detail: string; name: string; merchant_name: string }) => boolean };

const TRANSFER_NAME_RE = /\btransfer\b/i;
const CARD_PAYMENT_RE = /\b(card *payment|cc *payment|autopay|epay|bill *pay)\b/i;

const SEED_DISMISS_RULES: DismissRule[] = [
  {
    // Inflows are never expenses. Catches Stripe payout deposits + incoming refunds.
    reason: "Deposit / income, not an expense",
    test: (t) => t.direction === "in",
  },
  {
    // Internal transfers between own accounts.
    reason: "Internal transfer between accounts",
    test: (t) =>
      t.pfc_primary === "TRANSFER_IN" ||
      t.pfc_primary === "TRANSFER_OUT" ||
      TRANSFER_NAME_RE.test(t.name) ||
      TRANSFER_NAME_RE.test(t.merchant_name),
  },
  {
    // Credit-card payment sweeps.
    reason: "Credit card payment",
    test: (t) =>
      t.pfc_primary === "LOAN_PAYMENTS" ||
      t.pfc_detail === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" ||
      CARD_PAYMENT_RE.test(t.name) ||
      CARD_PAYMENT_RE.test(t.merchant_name),
  },
];

export function seedAutoDismiss(t: {
  direction: string;
  pfc_primary: string;
  pfc_detail: string;
  name: string;
  merchant_name: string;
}): { dismissed: boolean; reason?: string } {
  for (const rule of SEED_DISMISS_RULES) {
    if (rule.test(t)) return { dismissed: true, reason: rule.reason };
  }
  return { dismissed: false };
}

// ── Dedupe heuristic ─────────────────────────────────────────────────────────
// Surface a "possible duplicate" of an already-entered expense — never auto-skip.
// Match on: same amount_cents, expense_date within ±3 days, and a fuzzy merchant
// match (normalized, case-insensitive contains either direction).
const DUP_DATE_WINDOW_DAYS = 3;

type DupExpense = { id: string; vendor_name: string; amount_cents: number; expense_date: string };

function normalizeMerchant(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function daysApart(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const dbb = new Date(b + "T00:00:00Z").getTime();
  return Math.abs(da - dbb) / 86_400_000;
}

export function findDuplicateExpense(
  staged: { merchant_name: string; amount_cents: number; txn_date: string },
  expenses: DupExpense[],
): DupExpense | null {
  const merchant = normalizeMerchant(staged.merchant_name);
  for (const e of expenses) {
    if (e.amount_cents !== staged.amount_cents) continue;
    if (daysApart(e.expense_date, staged.txn_date) > DUP_DATE_WINDOW_DAYS) continue;
    const vendor = normalizeMerchant(e.vendor_name);
    if (!merchant || !vendor) continue;
    if (merchant.includes(vendor) || vendor.includes(merchant)) return e;
  }
  return null;
}
