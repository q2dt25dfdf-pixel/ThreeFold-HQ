import { TF_PLAIN_CLOSING } from "./emailSignature";
import { calcDiscountAmount, type QuoteDiscount } from "./salesTax";
import { depositTerms } from "./depositTerms";

// Single source for the deposit-request email. Extracted verbatim from
// ai/deposit-preview so the Jarvis preview, the HQ send, and the approve-to-pay
// flow all render the identical body — there must be exactly one of these.

export type DepositEmailLineItem = { name: string; quantity: number; [key: string]: unknown };

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtTaxRate(rate: number | null | undefined): string {
  if (rate == null) return "";
  return (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
}

export function buildDepositEmailBody(
  contactName: string,
  depositNumber: string | null,
  totalAmount: number,
  depositAmount: number,
  balanceRemaining: number,
  lineItems: DepositEmailLineItem[] | null,
  subtotal: number | null,
  salesTaxRate: number | null,
  salesTaxAmount: number | null,
  discount: QuoteDiscount | null,
  publicLink: string | null,
): string {
  const depositPercent = totalAmount > 0
    ? Math.round((depositAmount / totalAmount) * 100)
    : 50;
  const terms = depositTerms(depositPercent);

  const itemSummary = lineItems && lineItems.length > 0
    ? `\n\nItems included:\n${lineItems.map((i) => `• ${i.name} (×${i.quantity})`).join("\n")}`
    : "";

  const hasTax = salesTaxAmount != null && salesTaxAmount > 0;
  const taxLine = hasTax
    ? `\nSales Tax (${fmtTaxRate(salesTaxRate)}): ${fmtCurrency(salesTaxAmount!)}`
    : "";
  const discountLine = discount && subtotal != null
    ? `\n${discount.label}: -${fmtCurrency(calcDiscountAmount(subtotal, discount))}`
    : "";
  const subtotalLine = subtotal != null && subtotal !== totalAmount
    ? `\nSubtotal: ${fmtCurrency(subtotal)}${discountLine}${taxLine}`
    : "";
  const balanceLine = terms.showBalance
    ? `\nBalance Due on Completion: ${fmtCurrency(balanceRemaining)}`
    : "";

  return (
    `Hi ${contactName},\n\n` +
    `Your project with Threefold Supply Co. is approved and ready to move into production!\n\n` +
    `To kick things off, we require ${terms.isFull ? "payment" : "a deposit"} as shown below.${itemSummary}\n\n` +
    `${terms.requestNoun} #: ${depositNumber ?? "[DEPOSIT NUMBER]"}${subtotalLine}\n` +
    `Total Project Value: ${fmtCurrency(totalAmount)}\n` +
    `${terms.dueLabelWithPct}: ${fmtCurrency(depositAmount)}${balanceLine}\n\n` +
    `Please note: Card payments include a 3% processing fee. Bank account payments and checks do not.\n\n` +
    `View your full ${terms.requestNoun.toLowerCase()} here:\n${publicLink ?? "[DEPOSIT LINK]"}\n\n` +
    `${terms.oncePaidSentence} Questions? Just reply to this email.\n\n` +
    TF_PLAIN_CLOSING
  );
}

// Subject line, matching SendDepositModal / deposit-preview exactly.
export function buildDepositEmailSubject(
  depositNumber: string | null,
  totalAmount: number,
  depositAmount: number,
): string {
  const pct = totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50;
  const { subjectPrefix } = depositTerms(pct);
  return depositNumber
    ? `${subjectPrefix} ${depositNumber} | Threefold Supply Co.`
    : `${subjectPrefix} | Threefold Supply Co.`;
}
