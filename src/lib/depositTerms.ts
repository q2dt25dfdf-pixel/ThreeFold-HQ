// ── Deposit vs. full-payment wording ───────────────────────────────────────────
//
// When the deposit percentage is 100, the request collects the whole amount up
// front, so the word "deposit" is wrong on every customer-facing surface. This is
// the single source of truth for that wording — no surface hardcodes deposit vs.
// payment strings. Below 100%, every label keeps its existing deposit wording.
//
// Natural case is returned; callers that render uppercase (CSS text-transform or
// literal caps) uppercase the value themselves so existing styling is unchanged.

export type DepositTerms = {
  isFull: boolean;
  /** "Deposit Request" | "Payment Request" — the request noun (eyebrows, mailto, loading). */
  requestNoun: string;
  /** "Send Deposit Request" | "Send Payment Request" — HQ modal title. */
  sendTitle: string;
  /** "Deposit Details" | "Payment Details" — HQ modal section heading. */
  detailsHeading: string;
  /** "Deposit Percentage" | "Amount Percentage" — HQ modal input label. */
  percentageLabel: string;
  /** "Deposit Due" | "Amount Due" — tile/callout label with no percentage. */
  dueLabel: string;
  /** "Deposit Due (50%)" | "Amount Due" — amount line including the percentage. */
  dueLabelWithPct: string;
  /** "Deposit Required (50%)" | "Payment Required" — client page requirement label. */
  requiredLabel: string;
  /** "Deposit Amount" | "Amount Due" — payment panel amount label. */
  amountLabel: string;
  /** "Pay your deposit" | "Pay in full" — payment panel eyebrow. */
  payEyebrow: string;
  /** "Your Deposit Request" | "Your Payment Request" — email subject prefix. */
  subjectPrefix: string;
  /** Full "Once your …" sentence for the email body. */
  oncePaidSentence: string;
  /** Whether to show the remaining-balance row/tile (hidden when paid in full). */
  showBalance: boolean;
};

export function depositTerms(depositPercent: number): DepositTerms {
  const isFull = Number.isFinite(depositPercent) && depositPercent >= 100;
  const requestNoun = isFull ? "Payment Request" : "Deposit Request";
  return {
    isFull,
    requestNoun,
    sendTitle: isFull ? "Send Payment Request" : "Send Deposit Request",
    detailsHeading: isFull ? "Payment Details" : "Deposit Details",
    percentageLabel: isFull ? "Amount Percentage" : "Deposit Percentage",
    dueLabel: isFull ? "Amount Due" : "Deposit Due",
    dueLabelWithPct: isFull ? "Amount Due" : `Deposit Due (${depositPercent}%)`,
    requiredLabel: isFull ? "Payment Required" : `Deposit Required (${depositPercent}%)`,
    amountLabel: isFull ? "Amount Due" : "Deposit Amount",
    payEyebrow: isFull ? "Pay in full" : "Pay your deposit",
    subjectPrefix: isFull ? "Your Payment Request" : "Your Deposit Request",
    oncePaidSentence: isFull
      ? "Once your payment is received, we'll get started right away."
      : "Once your deposit is received, we'll get started right away.",
    showBalance: !isFull,
  };
}
