import { TF_PLAIN_CLOSING } from "./emailSignature";

// ─── Payment method ────────────────────────────────────────────────────────
export type PaymentMethod = "card" | "bank" | "check" | "cash" | "zelle" | "other";

// Options for the founder-facing dropdowns in the Finances editor.
export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "other", label: "Other" },
];

// Title-case label for "Payment Method: {X}" lines. null when unknown/empty —
// callers omit the clause entirely rather than printing "null".
export function paymentMethodLabel(m: unknown): string | null {
  const found = PAYMENT_METHOD_OPTIONS.find((o) => o.value === m);
  return found ? found.label : null;
}

// Sentence fragment for "Paid by {x} on {date}". null when unknown/empty.
export function paymentMethodPhrase(m: unknown): string | null {
  switch (m) {
    case "card": return "card";
    case "bank": return "bank transfer";
    case "check": return "check";
    case "cash": return "cash";
    case "zelle": return "Zelle";
    case "other": return "another method";
    default: return null;
  }
}

// ─── Which payment are we receipting ───────────────────────────────────────
export interface ReceiptSource {
  deposit_paid?: boolean;
  deposit_paid_date?: string | null;
  deposit_payment_method?: string | null;
  deposit_receipt_sent_at?: string | null;
  deposit_amount?: number | string | null;
  final_paid?: boolean;
  final_paid_date?: string | null;
  final_payment_method?: string | null;
  final_receipt_sent_at?: string | null;
  balance_remaining?: number | string | null;
  grand_total?: number | string | null;
  total_amount?: number | string | null;
}

export interface ReceiptInfo {
  paidInFull: boolean;                 // true => "Paid in Full", false => "Deposit Received"
  markLabel: string;                   // "PAID IN FULL" | "DEPOSIT RECEIVED"
  amountPaid: number;
  datePaid: string;                    // ISO (date-only ok); "" when unknown
  method: string | null;               // raw enum value or null
  balanceRemaining: number;            // 0 when paid in full
  phase: "deposit" | "final";
  sentField: "deposit_receipt_sent_at" | "final_receipt_sent_at";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

// Returns null when nothing is paid yet (no receipt to send / show).
// Never reports "paid in full" while a balance is outstanding.
export function resolveReceipt(src: ReceiptSource): ReceiptInfo | null {
  const grandTotal = src.grand_total != null ? num(src.grand_total) : num(src.total_amount);
  const balance = num(src.balance_remaining);
  const depositAmount = num(src.deposit_amount);

  if (src.final_paid === true) {
    return {
      paidInFull: true,
      markLabel: "PAID IN FULL",
      amountPaid: grandTotal,
      datePaid: src.final_paid_date ?? "",
      method: src.final_payment_method ?? null,
      balanceRemaining: 0,
      phase: "final",
      sentField: "final_receipt_sent_at",
    };
  }

  if (src.deposit_paid === true) {
    // Deposit that covers the whole order reads as "Paid in Full", not "Deposit Received".
    const coversFull = balance <= 0 || (grandTotal > 0 && depositAmount >= grandTotal);
    if (coversFull) {
      return {
        paidInFull: true,
        markLabel: "PAID IN FULL",
        amountPaid: grandTotal || depositAmount,
        datePaid: src.deposit_paid_date ?? "",
        method: src.deposit_payment_method ?? null,
        balanceRemaining: 0,
        phase: "deposit",
        sentField: "deposit_receipt_sent_at",
      };
    }
    return {
      paidInFull: false,
      markLabel: "DEPOSIT RECEIVED",
      amountPaid: depositAmount,
      datePaid: src.deposit_paid_date ?? "",
      method: src.deposit_payment_method ?? null,
      balanceRemaining: balance,
      phase: "deposit",
      sentField: "deposit_receipt_sent_at",
    };
  }

  return null;
}

// ─── Formatting helpers ────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export function fmtReceiptDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmtTaxRate(rate: number | null | undefined): string {
  if (rate == null) return "9.375%";
  return `${Math.round(rate * 10000) / 100}%`;
}

// "Paid by check on July 20, 2026" / "Paid on July 20, 2026" (method omitted) / "" when no date.
export function receiptPaidPhrase(method: unknown, iso: string): string {
  const date = fmtReceiptDate(iso);
  if (!date) return "";
  const phrase = paymentMethodPhrase(method);
  return phrase ? `Paid by ${phrase} on ${date}` : `Paid on ${date}`;
}

// ─── Receipt email (reuses /api/send-email + wrapInEmailTemplate downstream) ─
export interface ReceiptEmailInput {
  clientName: string;
  receipt: ReceiptInfo;
  orderName?: string | null;
  publicLink?: string | null;
  subtotal?: number | null;
  discountLabel?: string | null;
  discountAmount?: number | null;
  salesTaxRate?: number | null;
  salesTaxAmount?: number | null;
  grandTotal?: number | null;
}

export function buildReceiptEmail(input: ReceiptEmailInput): { subject: string; body: string } {
  const { receipt } = input;
  const name = (input.clientName || "there").trim();
  const lines: string[] = [];

  lines.push(`Hi ${name},`);
  lines.push("");
  lines.push("Thank you. Your payment has been received.");
  lines.push("");

  if (receipt.paidInFull) {
    lines.push(`Amount Paid: ${fmtCurrency(receipt.amountPaid)}`);
  } else {
    lines.push(`Deposit Received: ${fmtCurrency(receipt.amountPaid)}`);
    lines.push(`Balance Remaining: ${fmtCurrency(receipt.balanceRemaining)}`);
  }
  if (receipt.datePaid) lines.push(`Date: ${fmtReceiptDate(receipt.datePaid)}`);
  const methodLabel = paymentMethodLabel(receipt.method);
  if (methodLabel) lines.push(`Payment Method: ${methodLabel}`);
  if (input.orderName) lines.push(`Order: ${input.orderName}`);

  // Breakdown block, same format as the deposit/quote emails.
  const subtotal = input.subtotal ?? null;
  if (subtotal != null && subtotal > 0) {
    lines.push("");
    lines.push(`Subtotal: ${fmtCurrency(subtotal)}`);
    if (input.discountLabel && (input.discountAmount ?? 0) > 0) {
      lines.push(`${input.discountLabel}: -${fmtCurrency(input.discountAmount as number)}`);
    }
    if ((input.salesTaxAmount ?? 0) > 0) {
      lines.push(`Sales Tax (${fmtTaxRate(input.salesTaxRate)}): ${fmtCurrency(input.salesTaxAmount as number)}`);
    }
    if (input.grandTotal != null) lines.push(`Total: ${fmtCurrency(input.grandTotal)}`);
  }

  if (input.publicLink) {
    lines.push("");
    lines.push("View your receipt:");
    lines.push(input.publicLink);
  }

  lines.push("");
  lines.push(TF_PLAIN_CLOSING);

  return { subject: "Receipt - Threefold Supply Co.", body: lines.join("\n") };
}
