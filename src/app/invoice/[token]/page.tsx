"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";
import { C, dk } from "@/lib/clientTheme";

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface InvoiceData {
  id: string;
  order_name: string;
  client_name: string;
  subtotal?: number | null;
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
  final_due_date: string | null;
  status: string;
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
        else setData(d);
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, []);

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

  const isPaidInFull = data.final_paid;
  const isDepositPaid = data.deposit_paid;
  const hasTax = (data.sales_tax_amount ?? 0) > 0;
  const grandTotalDisplay = data.grand_total ?? data.total_amount;
  const isOverdue = data.final_due_date
    ? !isPaidInFull && new Date(data.final_due_date + "T23:59:59") < new Date()
    : false;

  const statusLabel = isPaidInFull
    ? "PAID IN FULL ✓"
    : isDepositPaid
    ? "DEPOSIT PAID"
    : "BALANCE DUE";

  const statusColor = isPaidInFull ? C.green : isOverdue ? C.red : C.amber;

  return (
    <PortalShell>
      <style>{INV_CSS}</style>

      {/* Header */}
      <div style={s.headerBlock}>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
      </div>

      <div style={s.rule} />

      <div style={s.eyebrow}>FINAL INVOICE</div>
      <div className="inv-headline">{data.client_name.toUpperCase()}</div>

      <div style={s.summaryStrip}>
        {data.order_name && (
          <div style={s.chip}>
            <div style={s.chipLabel}>PROJECT</div>
            <div style={s.chipValue}>{data.order_name}</div>
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
      <div className="portal-columns">

        {/* Left: itemization + payment summary */}
        <div className="portal-col-main">
          {data.line_items && data.line_items.length > 0 && (
            <div className="dk-card">
              <div style={s.cardEyebrow}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
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
                        {item.quantity} × {fmt(item.unitPrice)}
                      </div>
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
              PAYMENT SUMMARY
            </div>
            <div style={s.detailList}>
              <div style={s.detailRow}>
                <span style={{ ...s.detailKey, fontWeight: 700 }}>TOTAL PROJECT VALUE</span>
                <span style={{ ...s.detailVal, fontWeight: 700 }}>{fmt(grandTotalDisplay)}</span>
              </div>
              <div style={s.detailRow}>
                <div style={{ flex: 1 }}>
                  <span style={s.detailKey}>DEPOSIT</span>
                  {isDepositPaid && data.deposit_paid_date && (
                    <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px" }}>
                      Paid {fmtDate(data.deposit_paid_date)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                  <span style={s.detailVal}>{fmt(data.deposit_amount)}</span>
                  {isDepositPaid && (
                    <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", color: C.green, marginTop: "2px" }}>
                      PAID ✓
                    </div>
                  )}
                </div>
              </div>
              <div style={{ ...s.detailRow, borderBottom: hasTax ? undefined : "none" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ ...s.detailKey, color: isPaidInFull ? C.green : C.textSecondary, fontWeight: 700 }}>
                    BALANCE REMAINING
                  </span>
                  {data.final_due_date && !isPaidInFull && (
                    <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px", color: isOverdue ? C.red : C.textMuted, textTransform: "none" as const }}>
                      Due {fmtDate(data.final_due_date)}{isOverdue ? " — OVERDUE" : ""}
                    </div>
                  )}
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
              {hasTax && (
                <>
                  <button
                    onClick={() => setShowBreakdown((v) => !v)}
                    style={s.breakdownToggle}
                  >
                    {showBreakdown ? "▾" : "▸"} VIEW FULL PRICING BREAKDOWN
                  </button>
                  {showBreakdown && (
                    <div style={s.breakdownExpanded}>
                      <div style={s.detailRow}>
                        <span style={s.detailKey}>SUBTOTAL</span>
                        <span style={s.detailVal}>{fmt(data.subtotal ?? 0)}</span>
                      </div>
                      <div style={s.detailRow}>
                        <span style={s.detailKey}>SALES TAX ({data.sales_tax_rate != null ? `${Math.round(data.sales_tax_rate * 10000) / 100}%` : "9.375%"})</span>
                        <span style={{ ...s.detailVal, color: C.textSecondary }}>{fmt(data.sales_tax_amount ?? 0)}</span>
                      </div>
                      <div style={{ ...s.detailRow, borderBottom: "none" }}>
                        <span style={{ ...s.detailKey, fontWeight: 700 }}>TOTAL</span>
                        <span style={{ ...s.detailVal, fontWeight: 700 }}>{fmt(grandTotalDisplay)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!isPaidInFull ? (
              <div style={s.calloutPending}>
                <span style={s.calloutLabel}>BALANCE DUE</span>
                <span style={s.calloutAmountPending}>{fmt(data.balance_remaining)}</span>
              </div>
            ) : (
              <div style={s.calloutPaid}>
                <span style={{ ...s.calloutLabel, color: C.green }}>INVOICE</span>
                <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: how to pay */}
        <div className="portal-col-side">
          {isPaidInFull ? (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your final payment has been received and confirmed. Thank you for
                your business — it&apos;s been a pleasure working with you.
              </div>
            </div>
          ) : paymentParam === "success" ? (
            <div className="dk-card">
              <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your payment is being confirmed. Bank transfers may take a moment to
                process — this page will reflect the updated status once confirmed.
                No further action is needed.
              </div>
            </div>
          ) : (
            <div className="dk-card">
              <PaymentOptionsPanel
                amount={data.balance_remaining}
                label="REMAINING BALANCE"
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
              />
            </div>
          )}
        </div>
      </div>

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
          href={`mailto:${BUSINESS_EMAIL}?subject=Re: Invoice — ${data.order_name || data.client_name}`}
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
