"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";
import { C, dk } from "@/lib/clientTheme";
import { calcDiscountAmount, type QuoteDiscount } from "@/lib/salesTax";
import { DiscountBand, SavingsNote, SaveChip } from "@/components/DiscountUI";
import { resolveReceipt, receiptPaidPhrase, paymentMethodLabel } from "@/lib/receipt";

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
}

interface InvoiceData {
  id: string;
  order_name: string;
  client_name: string;
  contact_name?: string | null;
  deposit_request_number?: string | null;
  invoice_number?: string | null;
  portal_url?: string | null;
  subtotal?: number | null;
  discount?: QuoteDiscount | null;
  sales_tax_rate?: number | null;
  sales_tax_amount?: number | null;
  grand_total?: number | null;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  balance_remaining: number;
  final_paid: boolean;
  final_paid_date: string | null;
  paid_in_full?: boolean;
  final_invoice_sent_at?: string | null;
  final_due_date: string | null;
  deposit_payment_method?: string | null;
  final_payment_method?: string | null;
  status: string;
  doc_kind?: "receipt" | "invoice";
  line_items: LineItem[];
}

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const INV_CSS = `
  .inv-headline {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
    text-transform: uppercase;
    color: #181818;
    margin-bottom: 10px;
  }
  @media (min-width: 1024px) {
    .inv-headline { font-size: 64px; }
  }
  /* Deposit-received face on mobile: the reassurance (thank-you) sits ABOVE the summary. */
  @media (max-width: 1023px) {
    .dr-stack { display: flex; flex-direction: column; }
    .dr-stack .portal-col-side { order: -1; margin-top: 0; }
    .dr-stack .portal-col-main { margin-top: 48px; }
  }
  @media print {
    /* Clean white document, no screen chrome */
    html, body { background: #ffffff !important; }
    .portal-outer { max-width: 100% !important; padding: 0 !important; }
    /* Stack to a single readable column */
    .portal-columns { display: block !important; }
    .portal-col-side { margin-top: 28px !important; }
    /* Flatten cards for ink economy; keep each card intact across pages */
    .dk-card, .dk-card-elevated {
      box-shadow: none !important;
      border: 1px solid rgba(0,0,0,0.2) !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    /* Hide interactive / non-document controls (Download button, pay panel, toggle) */
    .no-print { display: none !important; }
    /* Always show the full pricing breakdown (subtotal/discount/SALES TAX/total) on the
       saved PDF, even when it is collapsed on screen. Overrides the inline display:none. */
    .breakdown-print { display: block !important; }
    @page { margin: 16mm; }
  }
`;

export default function InvoicePage() {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceToken, setInvoiceToken] = useState("");
  const [paymentParam, setPaymentParam] = useState<"success" | "cancelled" | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<"card" | "bank" | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [checkDeclared, setCheckDeclared] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
    setInvoiceToken(token);

    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "success") setPaymentParam("success");
    if (p === "cancelled") setPaymentParam("cancelled");

    if (!token) return;

    fetch(`/api/invoice/${token}`)
      .then((r) => r.json())
      .then((d: InvoiceData & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          // Default the pricing breakdown open when a discount exists (Step 4).
          const disc = d.discount ?? null;
          if (disc && calcDiscountAmount(d.subtotal ?? 0, disc) > 0) setShowBreakdown(true);
        }
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, []);

  // Set a clean document title so browser "Save as PDF" pre-fills a nice filename.
  useEffect(() => {
    if (!data) return;
    const safe = (v: string) => (v || "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "");
    const client = safe(data.client_name || data.contact_name || "Client") || "Client";
    const date = new Date().toISOString().slice(0, 10);
    const isDepReceipt = data.doc_kind === "receipt";
    const paidFull = data.final_paid || (data.deposit_paid && data.balance_remaining <= 0);
    const num = safe((isDepReceipt ? data.deposit_request_number : data.invoice_number) || "NA") || "NA";
    const prefix = isDepReceipt ? "Deposit-Receipt" : paidFull ? "Receipt" : "Invoice";
    document.title = `${prefix}_${num}_${client}_${date}`;
  }, [data]);

  const handlePay = async (method: "card" | "bank") => {
    if (!invoiceToken || checkoutLoading) return;
    setCheckoutLoading(method);
    setCheckoutError("");

    try {
      const res = await fetch("/api/stripe/create-invoice-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceToken, method }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (d.error || !d.url) {
        setCheckoutError(d.error ?? "Could not start checkout. Please try again.");
        setCheckoutLoading(null);
        return;
      }
      window.location.href = d.url;
    } catch {
      setCheckoutError("Could not connect to payment. Please try again.");
      setCheckoutLoading(null);
    }
  };

  // Declare "I'll mail a check" — a declaration, not a payment. Mirrors the deposit page's
  // handleDeclareCheck, but POSTs to the invoice-token route which writes
  // client_payment_method_intent="check" + payment_method_intent_declared_at onto the
  // FINANCES row. Never marks paid, never touches Stripe.
  const handleDeclareCheck = async () => {
    if (!invoiceToken || checkLoading) return;
    setCheckLoading(true);
    setCheckoutError("");
    try {
      const res = await fetch(`/api/invoice/${invoiceToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "check" }),
      });
      const d = (await res.json()) as { success?: boolean; error?: string };
      if (d.success) setCheckDeclared(true);
      else setCheckoutError(d.error ?? "Something went wrong. Please try again.");
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
    } finally {
      setCheckLoading(false);
    }
  };

  if (loading) {
    return (
      <PortalShell>
        <style>{INV_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your invoice...</div>
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <style>{INV_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
        <div style={s.rule} />
        <div style={s.eyebrow}>ERROR</div>
        <div className="inv-headline">INVOICE NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold representative.
        </div>
      </PortalShell>
    );
  }

  // Receipt framing. A deposit that covers the whole order reads as paid in full;
  // a deposit with an outstanding balance stays an invoice (unchanged from today).
  const receipt = resolveReceipt(data);
  const isPaidInFull = data.final_paid || (data.deposit_paid && data.balance_remaining <= 0);
  const isReceipt = receipt?.paidInFull === true;
  // ONE full payment (paid_in_full flag) reads as a clean single-payment receipt: one amount
  // row, no deposit/balance split, only the invoice number. A completed deposit+balance keeps
  // today's wording. Only meaningful in the paid state.
  const singleFullPayment = isPaidInFull && receipt?.singleFullPayment === true;
  const receiptPaidLine = receipt ? receiptPaidPhrase(receipt.method, receipt.datePaid) : "";
  const isDepositPaid = data.deposit_paid;
  // The deposit-receipt handoff view belongs ONLY to the receipt link (r- token) — a stable,
  // read-only deposit receipt, never a bill. The invoice link (tfi-) is ALWAYS the bill: it
  // shows PaymentOptionsPanel while a balance is owed and the paid-in-full confirmation once
  // paid. final_invoice_sent_at no longer gates the client invoice view (HQ still uses it for
  // owed-now logic); it is intentionally not read here anymore.
  const isReceiptLink = data.doc_kind === "receipt";
  const isDepositReceipt = isReceiptLink;
  const depositMethodLabel = paymentMethodLabel(data.deposit_payment_method);
  // Deposit-received thank-you copy (no dashes; contact first name, else no name).
  const contactFirst = (data.contact_name ?? "").trim().split(/\s+/)[0] || "";
  const thanksHeading = contactFirst ? `Thanks, ${contactFirst}. You're all set.` : `Thanks. You're all set.`;
  const thanksSub = "Your deposit is in and we're already getting to work. We'll handle the balance before delivery, nothing needed from you until then.";
  const hasTax = (data.sales_tax_amount ?? 0) > 0;
  const grandTotalDisplay = data.grand_total ?? data.total_amount;

  // Discount display (inherited from the quote; subtotal stays pre-discount).
  const discount = data.discount ?? null;
  const discountAmount = discount ? calcDiscountAmount(data.subtotal ?? 0, discount) : 0;
  const hasDiscount = discount != null && discountAmount > 0;
  const hasSubtotal = (data.subtotal ?? 0) > 0;
  const discountLabel = discount
    ? discount.type === "percent"
      ? `${discount.label} (-${discount.value}%)`
      : discount.label
    : "";

  const isOverdue = data.final_due_date
    ? !isPaidInFull && new Date(data.final_due_date + "T23:59:59") < new Date()
    : false;

  // State A (deposit receipt) reads "DEPOSIT PAID"; once the final invoice is sent it becomes
  // State B and reads "BALANCE DUE" (a real bill), so key off isDepositReceipt not isDepositPaid.
  const statusLabel = isPaidInFull
    ? "PAID IN FULL ✓"
    : isDepositReceipt
    ? "DEPOSIT PAID"
    : "BALANCE DUE";

  const statusColor = isPaidInFull || isDepositReceipt ? C.green : isOverdue ? C.red : C.amber;

  return (
    <PortalShell>
      <style>{INV_CSS}</style>

      {/* Download PDF — founder records; hidden when printing */}
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.textSecondary,
            background: "none",
            border: `1px solid ${C.border}`,
            borderRadius: "999px",
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          Download PDF
        </button>
      </div>

      {/* Header */}
      <div style={s.headerBlock}>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
      </div>

      <div style={s.rule} />

      <div style={{ ...s.eyebrow, ...(isDepositReceipt ? { color: C.green } : {}) }}>{(isReceipt || isDepositReceipt) ? "RECEIPT" : "FINAL INVOICE"}</div>
      <div className="inv-headline">{(data.contact_name || data.client_name).toUpperCase()}</div>
      {isDepositReceipt && <div style={s.depositStamp}>DEPOSIT RECEIVED</div>}

      <div style={s.summaryStrip}>
        {data.order_name && (
          <div style={s.chip}>
            <div style={s.chipLabel}>PROJECT</div>
            <div style={s.chipValue}>{data.order_name}</div>
          </div>
        )}
        {!isDepositReceipt && data.invoice_number && (
          <div style={s.chip}>
            <div style={s.chipLabel}>INVOICE NO.</div>
            <div style={s.chipValue}>{data.invoice_number}</div>
          </div>
        )}
        {!singleFullPayment && data.deposit_request_number && (
          <div style={s.chip}>
            <div style={s.chipLabel}>DEPOSIT NO.</div>
            <div style={s.chipValue}>{data.deposit_request_number}</div>
          </div>
        )}
        <div style={s.chip}>
          <div style={s.chipLabel}>TOTAL</div>
          <div style={s.chipValue}>{fmt(grandTotalDisplay)}</div>
        </div>
        <div style={s.chip}>
          <div style={s.chipLabel}>STATUS</div>
          <div style={{ ...s.chipValue, color: statusColor }}>{statusLabel}</div>
        </div>
      </div>

      <div style={s.rule} />

      {/* Two-column body */}
      <div className={"portal-columns" + (isDepositReceipt ? " dr-stack" : "")}>

        {/* Left: itemization + payment summary */}
        <div className="portal-col-main">
          {data.line_items && data.line_items.length > 0 && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>
                {!isDepositReceipt && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                )}
                WHAT&apos;S INCLUDED
              </div>
              <div style={s.detailList}>
                {data.line_items.map((item, i) => (
                  <div key={i} style={s.detailRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.detailKey}>{item.name.toUpperCase()}</div>
                      {item.description && (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px" }}>
                          {item.description}
                        </div>
                      )}
                      <div style={{ ...s.detailKey, marginTop: "4px" }}>
                        {item.quantity} ×{" "}
                        {item.originalUnitPrice != null && item.originalUnitPrice > item.unitPrice ? (
                          <>
                            <span style={{ textDecoration: "line-through", color: C.textMuted, marginRight: "6px" }}>
                              {fmt(item.originalUnitPrice)}
                            </span>
                            <span style={{ color: C.greenText }}>{fmt(item.unitPrice)}</span>
                          </>
                        ) : (
                          fmt(item.unitPrice)
                        )}
                      </div>
                      {item.originalUnitPrice != null && item.originalUnitPrice > item.unitPrice && (
                        <SaveChip perUnit={item.originalUnitPrice - item.unitPrice} />
                      )}
                    </div>
                    <span style={{ ...s.detailVal, flexShrink: 0, marginLeft: "16px" }}>
                      {fmt(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="dk-card">
            <div style={s.cardEyebrow}>
              {!isDepositReceipt && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                </svg>
              )}
              PAYMENT SUMMARY
            </div>
            <div style={s.detailList}>
              <div style={s.detailRow}>
                <span style={{ ...s.detailKey, fontWeight: 700 }}>TOTAL PROJECT VALUE</span>
                <span style={{ ...s.detailVal, fontWeight: 700 }}>{fmt(grandTotalDisplay)}</span>
              </div>
              {singleFullPayment ? (
                // ONE full payment: a single amount row, no deposit/balance split.
                <div style={{ ...s.detailRow, borderBottom: hasTax ? undefined : "none" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ ...s.detailKey, color: C.green, fontWeight: 700 }}>AMOUNT PAID</span>
                    {receiptPaidLine && (
                      <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px", color: C.textMuted, textTransform: "none" as const }}>
                        {receiptPaidLine}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                    <span style={{ ...s.detailVal, color: C.green }}>{fmt(grandTotalDisplay)}</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={isDepositReceipt ? { ...s.detailRow, ...s.depositPaidTint } : s.detailRow}>
                    <div style={{ flex: 1 }}>
                      <span style={s.detailKey}>DEPOSIT</span>
                      {isDepositPaid && data.deposit_paid_date && (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px" }}>
                          Paid {fmtDate(data.deposit_paid_date)}{isDepositReceipt && depositMethodLabel ? ` · ${depositMethodLabel}` : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                      <span style={s.detailVal}>{fmt(data.deposit_amount)}</span>
                      {isDepositPaid && (
                        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", color: C.green, marginTop: "2px" }}>
                          {isDepositReceipt ? "PAID" : "PAID ✓"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ ...s.detailRow, borderBottom: hasTax ? undefined : "none" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ ...s.detailKey, color: isPaidInFull ? C.green : C.textSecondary, fontWeight: 700 }}>
                        BALANCE REMAINING
                      </span>
                      {isDepositReceipt ? (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px", color: C.textMuted, textTransform: "none" as const }}>
                          Due before delivery · not yet owed
                        </div>
                      ) : data.final_due_date && !isPaidInFull ? (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px", color: isOverdue ? C.red : C.textMuted, textTransform: "none" as const }}>
                          Due {fmtDate(data.final_due_date)}{isOverdue ? " (OVERDUE)" : ""}
                        </div>
                      ) : null}
                      {isPaidInFull && data.final_paid_date && (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px" }}>
                          Paid {fmtDate(data.final_paid_date)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                      {isPaidInFull ? (
                        <span style={{ ...s.detailVal, color: C.green }}>PAID IN FULL ✓</span>
                      ) : (
                        <span style={{ ...s.detailVal, fontSize: "20px" }}>{fmt(data.balance_remaining)}</span>
                      )}
                    </div>
                  </div>
                </>
              )}
              {(hasTax || hasDiscount) && (
                <>
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    className="no-print"
                    style={s.breakdownToggle}
                  >
                    {isDepositReceipt ? "" : showBreakdown ? "▾ " : "▸ "}VIEW FULL PRICING BREAKDOWN
                  </button>
                  <div
                    className="breakdown-print"
                    style={{ ...s.breakdownExpanded, display: showBreakdown ? "block" : "none" }}
                  >
                      {hasSubtotal && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SUBTOTAL</span>
                          <span style={s.detailVal}>{fmt(data.subtotal ?? 0)}</span>
                        </div>
                      )}
                      {hasDiscount && (
                        <DiscountBand
                          label={discountLabel}
                          amount={fmt(discountAmount)}
                          labelStyle={s.detailKey}
                          valueStyle={s.detailVal}
                        />
                      )}
                      {hasTax && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SALES TAX ({data.sales_tax_rate != null ? `${Math.round(data.sales_tax_rate * 10000) / 100}%` : "9.375%"})</span>
                          <span style={{ ...s.detailVal, color: C.textSecondary }}>{fmt(data.sales_tax_amount ?? 0)}</span>
                        </div>
                      )}
                      <div style={{ ...s.detailRow, borderBottom: "none" }}>
                        <span style={{ ...s.detailKey, fontWeight: 700 }}>TOTAL</span>
                        <span style={{ ...s.detailVal, fontWeight: 700 }}>{fmt(grandTotalDisplay)}</span>
                      </div>
                  </div>
                </>
              )}
            </div>

            {isDepositReceipt ? null : !isPaidInFull ? (
              hasDiscount ? (
                <div style={{ ...s.calloutPending, flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={s.calloutLabel}>BALANCE DUE</span>
                    <span style={s.calloutAmountPending}>{fmt(data.balance_remaining)}</span>
                  </div>
                  <SavingsNote amount={fmt(discountAmount)} label={discount?.label ?? ""} />
                </div>
              ) : (
                <div style={s.calloutPending}>
                  <span style={s.calloutLabel}>BALANCE DUE</span>
                  <span style={s.calloutAmountPending}>{fmt(data.balance_remaining)}</span>
                </div>
              )
            ) : (
              <div style={{ ...s.calloutPaid, flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...s.calloutLabel, color: C.green }}>{isReceipt ? "RECEIPT" : "INVOICE"}</span>
                  <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
                </div>
                {receipt && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={s.receiptMetaStrong}>AMOUNT PAID {fmt(receipt.amountPaid)}</div>
                    {receiptPaidLine && <div style={s.receiptMetaSub}>{receiptPaidLine}</div>}
                  </div>
                )}
                {hasDiscount && <SavingsNote amount={fmt(discountAmount)} label={discount?.label ?? ""} />}
              </div>
            )}
          </div>
        </div>

        {/* Right: how to pay */}
        <div className="portal-col-side">
          {isPaidInFull ? (
            // Same dark-green confirm card as the deposit state (check circle + green label +
            // message). Wording unchanged. Paid-in-full keeps the OPEN PORTAL pill; final does not.
            <div style={s.handoffCard}>
              <div style={s.handoffCheck}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="#7fc9a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={s.portalLabel}>PAYMENT RECEIVED</div>
              <div style={s.handoffSub}>
                {singleFullPayment
                  ? "Payment received in full. Your project is officially underway, and we'll keep you posted at each step as we get it made. Thank you."
                  : "Your final payment has been received and confirmed. Thank you for your business. It's been a pleasure working with you."}
              </div>
              {/* Paid in full is an INITIAL payment (production about to start), so point the
                  client to their portal. Not shown on the 50/50 final leg (order complete). */}
              {singleFullPayment && data.portal_url && (
                <div style={s.portalRow}>
                  <div style={s.portalRowText}>
                    <div style={s.portalLabel}>YOUR CLIENT PORTAL</div>
                    <div style={s.portalDesc}>Track your order, designs, and payments anytime.</div>
                  </div>
                  <a href={data.portal_url} style={s.portalBtn}>
                    OPEN PORTAL
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          ) : isDepositReceipt ? (
            <div style={s.handoffCard}>
              <div style={s.handoffCheck}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="#7fc9a3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={s.handoffHeading}>{thanksHeading}</div>
              <div style={s.handoffSub}>{thanksSub}</div>
              {data.portal_url && (
                <div style={s.portalRow}>
                  <div style={s.portalRowText}>
                    <div style={s.portalLabel}>YOUR CLIENT PORTAL</div>
                    <div style={s.portalDesc}>Track your order, designs, and payments anytime.</div>
                  </div>
                  <a href={data.portal_url} style={s.portalBtn}>
                    OPEN PORTAL
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          ) : paymentParam === "success" ? (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your payment is being confirmed. Bank transfers may take a moment to
                process. This page will reflect the updated status once confirmed.
                No further action is needed.
              </div>
            </div>
          ) : (
            <div className="dk-card no-print">
              <PaymentOptionsPanel
                amount={data.balance_remaining}
                label="BALANCE NOW DUE"
                eyebrow="HOW TO PAY"
                onPayCard={() => void handlePay("card")}
                onPayBank={() => void handlePay("bank")}
                checkoutLoading={checkoutLoading}
                checkoutError={
                  checkoutError ||
                  (paymentParam === "cancelled"
                    ? "Payment was not completed. You can try again below."
                    : undefined)
                }
                onDeclareCheck={() => void handleDeclareCheck()}
                checkDeclared={checkDeclared}
                checkLoading={checkLoading}
                checkMemo={`Final balance${data.order_name ? ` — ${data.order_name}` : ""}`}
                onResetMethod={() => setCheckDeclared(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Questions */}
      <div style={s.rule} />
      <div className="dk-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {!isDepositReceipt && (
            <div style={s.questionsIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
          )}
          <div>
            <div style={s.questionsHeading}>QUESTIONS?</div>
            <div style={s.questionsText}>Reach out to your Threefold representative directly.</div>
          </div>
        </div>
        <a
          href={`mailto:${BUSINESS_EMAIL}?subject=Re: Invoice for ${data.order_name || data.client_name}`}
          style={s.btnOutline}
        >
          CONTACT THREEFOLD{isDepositReceipt ? "" : " →"}
        </a>
      </div>

      {/* Footer */}
      <div style={s.rule} />
      <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
      <div style={s.footerTagline}>Made by three, worn by all.</div>
    </PortalShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  ...dk,
  cardEyebrow: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.26em",
    color: C.textPrimary,
    textTransform: "uppercase" as const,
    marginBottom: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  questionsIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    background: C.bgSubtle,
    border: `1px solid ${C.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: C.textPrimary,
    flexShrink: 0,
  },
  questionsHeading: {
    fontSize: "18px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    color: C.textPrimary,
    textTransform: "uppercase" as const,
    marginBottom: "6px",
  },
  questionsText: {
    fontSize: "14px",
    color: C.textSecondary,
    lineHeight: 1.6,
  },
  breakdownToggle: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: C.textMuted,
    textTransform: "uppercase" as const,
    padding: "14px 0 4px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    textAlign: "left" as const,
  },
  breakdownExpanded: {
    borderTop: `1px solid ${C.border}`,
    marginTop: "4px",
    paddingTop: "4px",
  },
  depositStamp: {
    display: "inline-block",
    marginTop: "12px",
    padding: "6px 14px",
    borderRadius: "999px",
    border: `1.5px solid ${C.greenBorder}`,
    backgroundColor: C.greenSoft,
    color: C.greenText,
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.18em",
  },
  depositPaidTint: {
    backgroundColor: C.greenSoft,
    borderBottom: "none",
    borderRadius: "8px",
    paddingLeft: "12px",
    paddingRight: "12px",
    marginLeft: "-12px",
    marginRight: "-12px",
  },
  handoffCard: {
    background: "linear-gradient(155deg, #1c3a2e 0%, #16181c 100%)",
    borderRadius: "16px",
    padding: "30px",
    color: "#ffffff",
  },
  handoffCheck: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "18px",
  },
  handoffHeading: {
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    lineHeight: 1.25,
    color: "#ffffff",
    marginBottom: "10px",
  },
  handoffSub: {
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#b9c6bf",
  },
  portalRow: {
    marginTop: "22px",
    backgroundColor: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "18px 20px",
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  },
  portalRowText: {
    flex: "1 1 200px",
    minWidth: 0,
  },
  portalLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "#8fb3a2",
    textTransform: "uppercase" as const,
    marginBottom: "6px",
  },
  portalDesc: {
    fontSize: "14px",
    lineHeight: 1.5,
    color: "#dbe6e0",
  },
  portalBtn: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "44px",
    backgroundColor: "#ffffff",
    color: "#16181c",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    padding: "13px 20px",
    borderRadius: "999px",
    textDecoration: "none",
  },
  receiptMetaStrong: {
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    color: C.greenText,
    textTransform: "uppercase" as const,
  },
  receiptMetaSub: {
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    color: C.greenText,
    opacity: 0.75,
  },
};
