"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";
import { C, dk } from "@/lib/clientTheme";
import { calcDiscountAmount, type QuoteDiscount } from "@/lib/salesTax";

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
}

interface QuoteData {
  id: string;
  quote_number: string;
  client_name: string;
  client_email: string;
  items: string[];
  line_items?: LineItem[] | null;
  subtotal?: number | null;
  discount?: QuoteDiscount | null;
  sales_tax_rate?: number | null;
  sales_tax_amount?: number | null;
  grand_total?: number | null;
  total_amount: number;
  expiration_date: string;
  status: string;
  created_at: string;
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

const QUOTE_CSS = `
  .q-headline {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
    text-transform: uppercase;
    color: #181818;
    margin-bottom: 10px;
  }
  @media (min-width: 1024px) {
    .q-headline { font-size: 64px; }
  }
`;

export default function QuotePage() {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState("");
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
    if (!token) return;

    fetch(`/api/quote/${token}`)
      .then((r) => r.json())
      .then((d: QuoteData & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (d.status === "approved") setApproved(true);
        }
      })
      .catch(() => setError("Failed to load quote"))
      .finally(() => setLoading(false));
  }, []);

  async function handleApprove() {
    const token = window.location.pathname.split("/").pop() ?? "";
    setApproving(true);
    setApproveError("");
    try {
      const res = await fetch(`/api/quote/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgementAccepted: true }),
      });
      const json = await res.json() as { success?: boolean; alreadyApproved?: boolean; error?: string };
      if (json.success || json.alreadyApproved) {
        setApproved(true);
      } else {
        setApproveError(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setApproveError("Network error. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <PortalShell>
        <style>{QUOTE_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your quote...</div>
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <style>{QUOTE_CSS}</style>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
        <div style={s.rule} />
        <div style={s.eyebrow}>ERROR</div>
        <div className="q-headline">QUOTE NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold representative.
        </div>
      </PortalShell>
    );
  }

  const isExpired = data.expiration_date
    ? new Date(data.expiration_date + "T23:59:59") < new Date()
    : false;

  const hasTax = (data.sales_tax_amount ?? 0) > 0;
  const grandTotalDisplay = data.grand_total ?? data.total_amount;
  const taxRateDisplay = data.sales_tax_rate != null
    ? `${Math.round(data.sales_tax_rate * 10000) / 100}%`
    : "9.375%";

  // Discount display (derived — subtotal stays pre-discount).
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
      <style>{QUOTE_CSS}</style>

      {/* Header */}
      <div style={s.headerBlock}>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
      </div>

      <div style={s.rule} />

      <div style={s.eyebrow}>CUSTOM QUOTE</div>
      <div className="q-headline">{data.client_name.toUpperCase()}</div>

      <div style={s.summaryStrip}>
        <div style={s.chip}>
          <div style={s.chipLabel}>QUOTE NUMBER</div>
          <div style={s.chipValue}>{data.quote_number}</div>
        </div>
        <div style={s.chip}>
          <div style={s.chipLabel}>TOTAL</div>
          <div style={s.chipValue}>{fmt(grandTotalDisplay)}</div>
        </div>
        {data.expiration_date && (
          <div style={s.chip}>
            <div style={s.chipLabel}>VALID THROUGH</div>
            <div style={{ ...s.chipValue, color: isExpired ? C.red : C.textPrimary }}>
              {fmtDate(data.expiration_date)}
              {isExpired ? " (EXPIRED)" : ""}
            </div>
          </div>
        )}
      </div>

      <div style={s.rule} />

      {/* Two-column body */}
      <div className="portal-columns">

        {/* Left: pricing summary */}
        <div className="portal-col-main">
          <div className="dk-card">
            <div style={s.cardEyebrow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              PRICING SUMMARY
            </div>
            <div style={s.detailList}>
              {data.line_items && data.line_items.length > 0 ? (
                <>
                  {data.line_items.map((item, i) => (
                    <div key={i} style={s.detailRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.detailKey}>{item.name.toUpperCase()}</div>
                        {item.description && (
                          <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "3px", textTransform: "none" as const }}>
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
                              {fmt(item.unitPrice)}
                            </>
                          ) : (
                            fmt(item.unitPrice)
                          )}
                        </div>
                        {item.originalUnitPrice != null && item.originalUnitPrice > item.unitPrice && (
                          <div style={{ fontSize: "10px", color: C.textMuted, fontStyle: "italic", letterSpacing: "0.04em", marginTop: "3px", textTransform: "none" as const }}>
                            *Custom pricing applied
                          </div>
                        )}
                      </div>
                      <span style={{ ...s.detailVal, flexShrink: 0, marginLeft: "16px" }}>
                        {fmt(item.lineTotal)}
                      </span>
                    </div>
                  ))}
                  {(hasTax || hasDiscount) && (
                    <>
                      {hasSubtotal && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SUBTOTAL</span>
                          <span style={s.detailVal}>{fmt(data.subtotal ?? 0)}</span>
                        </div>
                      )}
                      {hasDiscount && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>{discountLabel}</span>
                          <span style={{ ...s.detailVal, color: C.textMuted }}>-{fmt(discountAmount)}</span>
                        </div>
                      )}
                      {hasTax && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SALES TAX ({taxRateDisplay})</span>
                          <span style={{ ...s.detailVal, color: C.textSecondary }}>{fmt(data.sales_tax_amount ?? 0)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ ...s.detailRow, marginTop: "4px" }}>
                    <span style={{ ...s.detailKey, color: C.textSecondary, fontWeight: 700 }}>
                      TOTAL PROJECT VALUE
                    </span>
                    <span style={{ ...s.detailVal, fontSize: "20px" }}>
                      {fmt(grandTotalDisplay)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {data.items.length > 0 &&
                    data.items.map((item, i) => (
                      <div key={i} style={s.detailRow}>
                        <span style={s.detailKey}>{item.toUpperCase()}</span>
                        <span style={s.detailVal}>—</span>
                      </div>
                    ))}
                  {(hasTax || hasDiscount) && (
                    <>
                      {hasSubtotal && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SUBTOTAL</span>
                          <span style={s.detailVal}>{fmt(data.subtotal ?? 0)}</span>
                        </div>
                      )}
                      {hasDiscount && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>{discountLabel}</span>
                          <span style={{ ...s.detailVal, color: C.textMuted }}>-{fmt(discountAmount)}</span>
                        </div>
                      )}
                      {hasTax && (
                        <div style={s.detailRow}>
                          <span style={s.detailKey}>SALES TAX ({taxRateDisplay})</span>
                          <span style={{ ...s.detailVal, color: C.textSecondary }}>{fmt(data.sales_tax_amount ?? 0)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ ...s.detailRow, marginTop: "4px" }}>
                    <span style={{ ...s.detailKey, color: C.textSecondary, fontWeight: 700 }}>
                      TOTAL PROJECT VALUE
                    </span>
                    <span style={{ ...s.detailVal, fontSize: "20px" }}>
                      {fmt(grandTotalDisplay)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div style={s.paymentCallout}>
              <span style={s.paymentCalloutLabel}>QUOTE TOTAL</span>
              <span style={s.paymentCalloutAmount}>{fmt(grandTotalDisplay)}</span>
            </div>
          </div>
        </div>

        {/* Right: approval + CTA */}
        <div className="portal-col-side">

          {approved ? (
            <div className="dk-card">
              <div style={s.cardEyebrow}>QUOTE APPROVED</div>
              <div style={{ ...s.bodyText, color: C.greenText, fontWeight: 600, marginBottom: "12px" }}>
                Your quote has been approved. Threefold Supply Co. will follow up with your deposit request.
              </div>
              <div style={s.bodyText}>
                Questions? Reply to the email you received or contact us directly.
              </div>
              <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                CONTACT THREEFOLD →
              </a>
            </div>
          ) : (
            <>
              <div className="dk-card">
                <div style={s.cardEyebrow}>APPROVE THIS QUOTE</div>
                <div style={s.bodyText}>
                  Review the pricing summary, then check the box below and click <strong>Approve Quote</strong> to move forward.
                </div>
                <label style={s.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    disabled={isExpired || approving}
                    style={s.checkboxInput}
                  />
                  <span style={s.checkboxText}>
                    I approve this quote and understand that all products are custom made specifically for my order. Once artwork is approved and production begins, orders cannot be canceled, returned, or refunded.
                  </span>
                </label>
                <div style={s.checkboxNote}>
                  If there is an issue caused by a manufacturing defect or production error, please contact us and we will work with you to make it right.
                </div>
                {approveError && (
                  <div style={s.errorText}>{approveError}</div>
                )}
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={!acknowledged || isExpired || approving}
                  style={{
                    ...s.btnApprove,
                    opacity: (!acknowledged || isExpired || approving) ? 0.45 : 1,
                    cursor: (!acknowledged || isExpired || approving) ? "not-allowed" : "pointer",
                  }}
                >
                  {approving ? "APPROVING..." : "APPROVE QUOTE →"}
                </button>
              </div>

              <div className="dk-card">
                <div style={s.cardEyebrow}>HAVE QUESTIONS?</div>
                <div style={s.bodyText}>
                  Reply to the email you received or contact your Threefold representative directly.
                </div>
                <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                  CONTACT THREEFOLD →
                </a>
              </div>
            </>
          )}
        </div>
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
  paymentCallout: {
    marginTop: "24px",
    border: `1.5px solid ${C.greenBorder}`,
    backgroundColor: C.greenSoft,
    padding: "20px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: "8px",
  },
  paymentCalloutLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: C.greenText,
  },
  paymentCalloutAmount: {
    fontSize: "26px",
    fontWeight: 700,
    color: C.greenText,
    letterSpacing: "-0.01em",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    cursor: "pointer",
    marginTop: "20px",
    marginBottom: "12px",
  },
  checkboxInput: {
    marginTop: "2px",
    flexShrink: 0,
    width: "16px",
    height: "16px",
    accentColor: "#181818",
    cursor: "pointer",
  },
  checkboxText: {
    fontSize: "13px",
    lineHeight: "1.55",
    color: C.textPrimary,
    fontWeight: 500,
  },
  checkboxNote: {
    fontSize: "12px",
    color: C.textSecondary,
    lineHeight: "1.5",
    marginBottom: "20px",
  },
  btnApprove: {
    display: "block",
    width: "100%",
    textAlign: "center" as const,
    padding: "14px 24px",
    borderRadius: "8px",
    border: "none",
    backgroundColor: "#181818",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    transition: "background 0.15s",
    marginTop: "4px",
  },
  errorText: {
    fontSize: "13px",
    color: C.red,
    marginBottom: "12px",
    fontWeight: 500,
  },
};
