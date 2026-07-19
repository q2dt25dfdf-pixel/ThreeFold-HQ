"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";
import PortalShell from "@/components/PortalShell";
import { C, dk } from "@/lib/clientTheme";
import { calcDiscountAmount, type QuoteDiscount } from "@/lib/salesTax";
import { depositTerms } from "@/lib/depositTerms";
import { DiscountBand, SavingsNote, SaveChip } from "@/components/DiscountUI";

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
}

interface DepositData {
  id: string;
  deposit_request_number: string;
  client_name: string;
  client_email: string;
  subtotal?: number | null;
  discount?: QuoteDiscount | null;
  sales_tax_rate?: number | null;
  sales_tax_amount?: number | null;
  grand_total?: number | null;
  total_amount: number;
  deposit_amount: number;
  balance_remaining: number;
  line_items?: LineItem[] | null;
  payment_instructions: string;
  notes: string;
  status: string;
  created_at: string;
  voided_at?: string | null;
  voided_reason?: string | null;
}

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

const DEP_CSS = `
  .dep-headline {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
    text-transform: uppercase;
    color: #181818;
    margin-bottom: 10px;
  }
  @media (min-width: 1024px) {
    .dep-headline { font-size: 64px; }
  }
`;

export default function DepositPage() {
  const [data, setData] = useState<DepositData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [depositToken, setDepositToken] = useState("");
  const [paymentParam, setPaymentParam] = useState<"success" | "cancelled" | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<"card" | "bank" | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [checkDeclared, setCheckDeclared] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
    setDepositToken(token);

    const params = new URLSearchParams(window.location.search);
    const p = params.get("payment");
    if (p === "success") setPaymentParam("success");
    if (p === "cancelled") setPaymentParam("cancelled");

    if (!token) return;

    fetch(`/api/deposit/${token}`)
      .then((r) => r.json())
      .then((d: DepositData & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          // Default the pricing breakdown open when a discount exists (Step 4).
          const disc = d.discount ?? null;
          if (disc && calcDiscountAmount(d.subtotal ?? 0, disc) > 0) setShowBreakdown(true);
        }
      })
      .catch(() => setError("Failed to load deposit request"))
      .finally(() => setLoading(false));
  }, []);

  const handlePay = async (method: "card" | "bank") => {
    if (!depositToken || checkoutLoading) return;
    setCheckoutLoading(method);
    setCheckoutError("");

    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositToken, method }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (d.error) {
        setCheckoutError(d.error);
      } else if (d.url) {
        window.location.href = d.url;
      }
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Declare "I'll mail a check" — a declaration, not a payment. Mirrors the quote page:
  // POSTs to the deposit-token route, which writes client_payment_method_intent="check"
  // + payment_method_intent_declared_at onto this deposit_requests row.
  const handleDeclareCheck = async () => {
    if (!depositToken || checkLoading) return;
    setCheckLoading(true);
    setCheckoutError("");
    try {
      const res = await fetch(`/api/deposit/${depositToken}`, {
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
        <style>{DEP_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your deposit request...</div>
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <style>{DEP_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
        <div style={s.rule} />
        <div style={s.eyebrow}>ERROR</div>
        <div className="dep-headline">REQUEST NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold representative.
        </div>
      </PortalShell>
    );
  }

  // Voided by a quote revision — show a polite "no longer current" state with no
  // amounts and no pay buttons. The Stripe checkout route is the hard block.
  if (data.voided_at) {
    return (
      <PortalShell>
        <style>{DEP_CSS}</style>
        <div style={s.headerBlock}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.tagline}>Made by three, worn by all.</div>
        </div>
        <div style={s.rule} />
        <div style={s.eyebrow}>DEPOSIT REQUEST</div>
        <div className="dep-headline">NO LONGER CURRENT</div>
        <div style={{ ...s.bodyText, marginTop: "16px" }}>
          This request is no longer current. Please contact Threefold Supply Co. and
          we&apos;ll send you an updated payment link.
        </div>
        <a
          href={`mailto:${BUSINESS_EMAIL}?subject=Re: Deposit Request ${data.deposit_request_number}`}
          style={s.btnOutline}
        >
          CONTACT THREEFOLD →
        </a>
        <div style={s.rule} />
        <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.footerTagline}>Made by three, worn by all.</div>
      </PortalShell>
    );
  }

  const isPaid = data.status === "paid";
  const isPending = data.status === "pending";
  const hasTax = (data.sales_tax_amount ?? 0) > 0;
  const grandTotalDisplay = data.grand_total ?? data.total_amount;
  const depositPercent = grandTotalDisplay > 0
    ? Math.round((data.deposit_amount / grandTotalDisplay) * 100)
    : 50;
  const terms = depositTerms(depositPercent);

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

  return (
    <PortalShell>
      <style>{DEP_CSS}</style>

      {/* Header */}
      <div style={s.headerBlock}>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
      </div>

      <div style={s.rule} />

      <div style={s.eyebrow}>{terms.requestNoun.toUpperCase()}</div>
      <div className="dep-headline">{data.client_name.toUpperCase()}</div>

      <div style={s.summaryStrip}>
        <div style={s.chip}>
          <div style={s.chipLabel}>REQUEST NUMBER</div>
          <div style={s.chipValue}>{data.deposit_request_number}</div>
        </div>
        <div style={s.chip}>
          <div style={s.chipLabel}>STATUS</div>
          <div style={{ ...s.chipValue, color: isPaid ? C.green : isPending ? "#6aabea" : C.amber }}>
            {isPaid ? "PAID ✓" : isPending ? "PROCESSING" : "AWAITING PAYMENT"}
          </div>
        </div>
      </div>

      <div style={s.rule} />

      {/* Two-column body */}
      <div className="portal-columns">

        {/* Left: project details + payment breakdown */}
        <div className="portal-col-main">
          {data.line_items && data.line_items.length > 0 && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>WHAT&apos;S INCLUDED</div>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
              </svg>
              PAYMENT BREAKDOWN
            </div>
            <div style={s.detailList}>
              <div style={s.detailRow}>
                <span style={{ ...s.detailKey, fontWeight: 700 }}>TOTAL PROJECT VALUE</span>
                <span style={{ ...s.detailVal, fontWeight: 700 }}>{fmt(grandTotalDisplay)}</span>
              </div>
              <div style={terms.showBalance ? s.detailRow : { ...s.detailRow, borderBottom: "none" }}>
                <span style={s.detailKey}>{terms.requiredLabel.toUpperCase()}</span>
                <span style={s.detailVal}>{fmt(data.deposit_amount)}</span>
              </div>
              {terms.showBalance && (
                <div style={{ ...s.detailRow, borderBottom: "none" }}>
                  <span style={s.detailKey}>BALANCE DUE ON COMPLETION</span>
                  <span style={s.detailVal}>{fmt(data.balance_remaining)}</span>
                </div>
              )}
              {(hasTax || hasDiscount) && (
                <>
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    style={s.breakdownToggle}
                  >
                    {showBreakdown ? "▾" : "▸"} VIEW FULL PRICING BREAKDOWN
                  </button>
                  {showBreakdown && (
                    <div style={s.breakdownExpanded}>
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
                  )}
                </>
              )}
            </div>

            {!isPaid ? (
              hasDiscount ? (
                <div style={{ ...s.calloutPending, flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={s.calloutLabel}>{terms.dueLabel.toUpperCase()}</span>
                    <span style={s.calloutAmountPending}>{fmt(data.deposit_amount)}</span>
                  </div>
                  <SavingsNote amount={fmt(discountAmount)} label={discount?.label ?? ""} />
                </div>
              ) : (
                <div style={s.calloutPending}>
                  <span style={s.calloutLabel}>{terms.dueLabel.toUpperCase()}</span>
                  <span style={s.calloutAmountPending}>{fmt(data.deposit_amount)}</span>
                </div>
              )
            ) : hasDiscount ? (
              <div style={{ ...s.calloutPaid, flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...s.calloutLabel, color: C.green }}>{terms.isFull ? "PAYMENT" : "DEPOSIT"}</span>
                  <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
                </div>
                <SavingsNote amount={fmt(discountAmount)} label={discount?.label ?? ""} />
              </div>
            ) : (
              <div style={s.calloutPaid}>
                <span style={{ ...s.calloutLabel, color: C.green }}>{terms.isFull ? "PAYMENT" : "DEPOSIT"}</span>
                <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: payment action + notes */}
        <div className="portal-col-side">
          {isPaid && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your deposit has been received and confirmed. Your order has now entered
                production.
              </div>
              <div style={{ ...s.bodyText, marginTop: "16px" }}>
                You will receive access to your Client Portal shortly, where you can:
              </div>
              <ul style={{ marginTop: "12px", paddingLeft: "0", listStyle: "none" }}>
                {[
                  "Track order progress",
                  "View approved designs",
                  "Monitor production status",
                  "Review payment information",
                  "Receive estimated completion and delivery updates",
                ].map((item) => (
                  <li key={item} style={{ ...s.bodyText, marginTop: "6px", display: "flex", gap: "8px" }}>
                    <span style={{ color: C.green, flexShrink: 0 }}>•</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div style={{ ...s.bodyText, marginTop: "16px" }}>
                Thank you for choosing Threefold Supply Co.
              </div>
            </div>
          )}

          {isPending && !isPaid && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT IN PROGRESS</div>
              <div style={s.bodyText}>
                Your bank transfer is being processed. ACH payments typically settle
                within 3 to 5 business days. You will receive confirmation once the
                payment clears.
              </div>
            </div>
          )}

          {!isPaid && !isPending && paymentParam === "success" && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your payment is being confirmed. Bank transfers may take a moment to
                process. This page will reflect the updated status once confirmed.
                No further action is needed.
              </div>
            </div>
          )}

          {!isPaid && !isPending && paymentParam === "cancelled" && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT CANCELLED</div>
              <div style={s.bodyText}>
                Your payment was not completed. You can try again whenever you are ready.
              </div>
              <div style={{ marginTop: "20px" }}>
                <PaymentOptionsPanel
                  amount={data.deposit_amount}
                  label={terms.amountLabel}
                  eyebrow=""
                  onPayCard={() => void handlePay("card")}
                  onPayBank={() => void handlePay("bank")}
                  checkoutLoading={checkoutLoading}
                  checkoutError={checkoutError || undefined}
                  onDeclareCheck={() => void handleDeclareCheck()}
                  checkDeclared={checkDeclared}
                  checkLoading={checkLoading}
                  checkMemo={`Deposit ${data.deposit_request_number}`}
                  onResetMethod={() => setCheckDeclared(false)}
                />
              </div>
            </div>
          )}

          {!isPaid && !isPending && paymentParam === null && (
            <div className="dk-card">
              <PaymentOptionsPanel
                amount={data.deposit_amount}
                label={terms.amountLabel}
                eyebrow={terms.payEyebrow}
                onPayCard={() => void handlePay("card")}
                onPayBank={() => void handlePay("bank")}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError || undefined}
                onDeclareCheck={() => void handleDeclareCheck()}
                checkDeclared={checkDeclared}
                checkLoading={checkLoading}
                checkMemo={`Deposit ${data.deposit_request_number}`}
                onResetMethod={() => setCheckDeclared(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <>
          <div style={s.rule} />
          <div className="dk-card">
            <div style={s.cardEyebrow}>NOTES</div>
            <div style={s.notesBlock}>{data.notes}</div>
          </div>
        </>
      )}

      {/* Questions */}
      <div style={s.rule} />
      <div className="dk-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={s.questionsIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
          </div>
          <div>
            <div style={s.questionsHeading}>QUESTIONS?</div>
            <div style={s.questionsText}>Reach out to your Threefold representative directly.</div>
          </div>
        </div>
        <a
          href={`mailto:${BUSINESS_EMAIL}?subject=Re: ${terms.requestNoun} ${data.deposit_request_number}`}
          style={s.btnOutline}
        >
          CONTACT THREEFOLD →
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
};
