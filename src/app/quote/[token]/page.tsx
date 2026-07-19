"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";
import { C, dk } from "@/lib/clientTheme";
import { calcDiscountAmount, type QuoteDiscount } from "@/lib/salesTax";
import { DiscountBand, SavingsNote, SaveChip } from "@/components/DiscountUI";

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
  deposit_minimum?: number | null;
  expiration_date: string;
  status: string;
  created_at: string;
  superseded_by?: string | null;
  superseded_at?: string | null;
  deposit_public_token?: string | null;
  deposit_public_link?: string | null;
  deposit_status?: string | null;
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

  // Deposit handoff from the approve PATCH (or, on a reload, from the GET).
  const [depositToken, setDepositToken] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);

  // Amount picker + pay state.
  const [amountMode, setAmountMode] = useState<"min" | "full" | "custom">("min");
  const [customAmount, setCustomAmount] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState<"card" | "bank" | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkDeclared, setCheckDeclared] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
    if (!token) return;

    fetch(`/api/quote/${token}`)
      .then((r) => r.json())
      .then((d: QuoteData & { error?: string }) => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (d.status === "approved") {
            setApproved(true);
            // Fresh load of an already-approved quote: the deposit comes from GET.
            if (d.deposit_public_token) setDepositToken(d.deposit_public_token);
            if (d.deposit_status) setDepositStatus(d.deposit_status);
          }
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
      const json = await res.json() as {
        success?: boolean; alreadyApproved?: boolean; error?: string;
        depositToken?: string; depositLink?: string; depositStatus?: string;
      };
      if (json.success || json.alreadyApproved) {
        setApproved(true);
        // Just-approved: the deposit token/link/status come from the PATCH response
        // (the page does not refetch). Piece 3 renders the pay card from these.
        if (json.depositToken) setDepositToken(json.depositToken);
        if (json.depositStatus) setDepositStatus(json.depositStatus);
      } else {
        setApproveError(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setApproveError("Network error. Please try again.");
    } finally {
      setApproving(false);
    }
  }

  // Persist the chosen amount server-side (clamped there) BEFORE any pay/declare
  // action, so the stored deposit_amount always matches what the client sees.
  // Returns true on success; surfaces the server message otherwise.
  async function persistAmount(amount: number): Promise<boolean> {
    const token = window.location.pathname.split("/").pop() ?? "";
    try {
      const res = await fetch(`/api/quote/${token}/deposit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = await res.json() as { deposit_amount?: number; error?: string };
      if (json.error) { setCheckoutError(json.error); return false; }
      return true;
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
      return false;
    }
  }

  async function handlePay(method: "card" | "bank", amount: number) {
    if (!depositToken || checkoutLoading) return;
    setCheckoutLoading(method);
    setCheckoutError("");
    if (!(await persistAmount(amount))) { setCheckoutLoading(null); return; }
    const token = window.location.pathname.split("/").pop() ?? "";
    // Record the intended method (non-blocking — it must not delay checkout).
    void fetch(`/api/quote/${token}/deposit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositToken, method }),
      });
      const d = await res.json() as { url?: string; error?: string };
      if (d.error) setCheckoutError(d.error);
      else if (d.url) { window.location.href = d.url; return; }
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
    }
    setCheckoutLoading(null);
  }

  async function handleDeclareCheck(amount: number) {
    if (!depositToken || checkLoading) return;
    setCheckLoading(true);
    setCheckoutError("");
    if (!(await persistAmount(amount))) { setCheckLoading(false); return; }
    const token = window.location.pathname.split("/").pop() ?? "";
    try {
      const res = await fetch(`/api/quote/${token}/deposit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "check" }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) setCheckDeclared(true);
      else setCheckoutError(d.error ?? "Something went wrong. Please try again.");
    } catch {
      setCheckoutError("Something went wrong. Please try again.");
    }
    setCheckLoading(false);
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

  // Superseded by a newer quote — the client must not review or approve a price we
  // no longer offer. Point them to their email for the current version. Server-side
  // PATCH also refuses approval, so this is defense-in-depth, not the only guard.
  if (data.superseded_by) {
    return (
      <PortalShell>
        <style>{QUOTE_CSS}</style>
        <div style={s.headerBlock}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.tagline}>Made by three, worn by all.</div>
        </div>
        <div style={s.rule} />
        <div style={s.eyebrow}>CUSTOM QUOTE</div>
        <div className="q-headline">UPDATED QUOTE SENT</div>
        <div style={{ ...s.bodyText, marginTop: "16px" }}>
          An updated quote has been sent to you. Please check your email for the
          current version.
        </div>
        <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
          CONTACT THREEFOLD →
        </a>
        <div style={s.rule} />
        <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.footerTagline}>Made by three, worn by all.</div>
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

  // ── Deposit amount picker ─────────────────────────────────────────────────────
  // Minimum = grand_total × (deposit_minimum ?? 0.5); maximum = grand_total.
  const minFraction = data.deposit_minimum ?? 0.5;
  const depositMinimum = Math.round(grandTotalDisplay * minFraction * 100) / 100;
  // When the minimum equals the total (100% minimum), a picker is a fake choice —
  // render none and just state the amount due.
  const fullOnly = depositMinimum >= grandTotalDisplay;
  const customParsed = parseFloat(customAmount);
  const customClamped = Number.isFinite(customParsed)
    ? Math.round(Math.min(Math.max(customParsed, depositMinimum), grandTotalDisplay) * 100) / 100
    : depositMinimum;
  const selectedAmount = fullOnly
    ? grandTotalDisplay
    : amountMode === "full"
      ? grandTotalDisplay
      : amountMode === "custom"
        ? customClamped
        : depositMinimum;
  const balanceBeforeDelivery = Math.max(Math.round((grandTotalDisplay - selectedAmount) * 100) / 100, 0);

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
                  {(hasTax || hasDiscount) && (
                    <>
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
                        <DiscountBand
                          label={discountLabel}
                          amount={fmt(discountAmount)}
                          labelStyle={s.detailKey}
                          valueStyle={s.detailVal}
                        />
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

            {hasDiscount ? (
              <div style={{ ...s.paymentCallout, flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={s.paymentCalloutLabel}>QUOTE TOTAL</span>
                  <span style={s.paymentCalloutAmount}>{fmt(grandTotalDisplay)}</span>
                </div>
                <SavingsNote amount={fmt(discountAmount)} label={discount?.label ?? ""} />
              </div>
            ) : (
              <div style={s.paymentCallout}>
                <span style={s.paymentCalloutLabel}>QUOTE TOTAL</span>
                <span style={s.paymentCalloutAmount}>{fmt(grandTotalDisplay)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: approval + CTA */}
        <div className="portal-col-side">

          {approved ? (
            depositStatus === "paid" ? (
              // Mirrors the deposit portal's isPaid state — payment received, no pay card.
              <div className="dk-card">
                <div style={s.cardEyebrow}>PAYMENT RECEIVED</div>
                <div style={{ ...s.bodyText, color: C.greenText, fontWeight: 600 }}>
                  Your deposit has been received and confirmed. Your order has now entered production.
                </div>
                <div style={{ ...s.bodyText, marginTop: "16px" }}>
                  You&apos;ll receive access to your Client Portal shortly. Thank you for choosing
                  Threefold Supply Co.
                </div>
                <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                  CONTACT THREEFOLD →
                </a>
              </div>
            ) : depositStatus === "pending" ? (
              // Mirrors the deposit portal's isPending state — processing, no pay card.
              <div className="dk-card">
                <div style={s.cardEyebrow}>PAYMENT IN PROGRESS</div>
                <div style={s.bodyText}>
                  Your bank transfer is being processed. ACH payments typically settle within 3 to 5
                  business days. You&apos;ll receive confirmation once the payment clears.
                </div>
                <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                  CONTACT THREEFOLD →
                </a>
              </div>
            ) : depositToken ? (
              // Payable: amount picker + reused PaymentOptionsPanel (card / bank / check).
              <div className="dk-card">
                <div style={s.cardEyebrow}>APPROVED — COMPLETE YOUR DEPOSIT</div>

                {fullOnly ? (
                  <div style={s.amountDueLine}>
                    <span style={s.payLabel}>AMOUNT DUE</span>
                    <span style={s.payValue}>{fmt(grandTotalDisplay)}</span>
                  </div>
                ) : (
                  <>
                    <div style={s.pickerLabel}>HOW MUCH WOULD YOU LIKE TO PAY NOW?</div>
                    <div style={s.pickerRow}>
                      <button
                        type="button"
                        onClick={() => setAmountMode("min")}
                        style={amountMode === "min" ? { ...s.pill, ...s.pillActive } : s.pill}
                      >
                        MINIMUM DEPOSIT
                        <span style={s.pillSub}>{fmt(depositMinimum)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmountMode("full")}
                        style={amountMode === "full" ? { ...s.pill, ...s.pillActive } : s.pill}
                      >
                        PAY IN FULL
                        <span style={s.pillSub}>{fmt(grandTotalDisplay)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmountMode("custom")}
                        style={amountMode === "custom" ? { ...s.pill, ...s.pillActive } : s.pill}
                      >
                        ANOTHER AMOUNT
                        <span style={s.pillSub}>
                          {fmt(depositMinimum)}–{fmt(grandTotalDisplay)}
                        </span>
                      </button>
                    </div>
                    {amountMode === "custom" && (
                      <div style={s.customWrap}>
                        <span style={s.customPrefix}>$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={depositMinimum}
                          max={grandTotalDisplay}
                          step="0.01"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          placeholder={depositMinimum.toFixed(2)}
                          style={s.customInput}
                        />
                      </div>
                    )}
                  </>
                )}

                <div style={s.payBreakdown}>
                  <div style={s.payBreakRow}>
                    <span style={s.payLabel}>PAYING NOW</span>
                    <span style={s.payValue}>{fmt(selectedAmount)}</span>
                  </div>
                  <div style={{ ...s.payBreakRow, borderBottom: "none" }}>
                    <span style={s.payLabel}>BALANCE BEFORE DELIVERY</span>
                    <span style={{ ...s.payValue, color: C.textSecondary }}>{fmt(balanceBeforeDelivery)}</span>
                  </div>
                </div>

                <div style={{ marginTop: "20px" }}>
                  <PaymentOptionsPanel
                    amount={selectedAmount}
                    label="PAYING NOW"
                    eyebrow=""
                    onPayCard={() => void handlePay("card", selectedAmount)}
                    onPayBank={() => void handlePay("bank", selectedAmount)}
                    checkoutLoading={checkoutLoading}
                    checkoutError={checkoutError || undefined}
                    onDeclareCheck={() => void handleDeclareCheck(selectedAmount)}
                    checkDeclared={checkDeclared}
                    checkLoading={checkLoading}
                    checkMemo={`Quote ${data.quote_number}`}
                    onResetMethod={() => setCheckDeclared(false)}
                  />
                </div>
              </div>
            ) : (
              // No deposit token — a quote with no lead cannot mint one. Keep the
              // contact fallback rather than render a broken picker.
              <div className="dk-card">
                <div style={s.cardEyebrow}>QUOTE APPROVED</div>
                <div style={{ ...s.bodyText, color: C.greenText, fontWeight: 600, marginBottom: "12px" }}>
                  Your quote has been approved. Threefold Supply Co. will follow up with payment details.
                </div>
                <div style={s.bodyText}>
                  Questions? Reply to the email you received or contact us directly.
                </div>
                <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                  CONTACT THREEFOLD →
                </a>
              </div>
            )
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
  pickerLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: C.textSecondary,
    textTransform: "uppercase" as const,
    marginBottom: "12px",
  },
  pickerRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "8px",
    marginBottom: "8px",
  },
  pill: {
    flex: "1 1 92px",
    minWidth: "92px",
    minHeight: "56px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    padding: "10px 8px",
    borderRadius: "8px",
    border: `1.5px solid ${C.border}`,
    backgroundColor: "#ffffff",
    color: C.textSecondary,
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textAlign: "center" as const,
    cursor: "pointer",
    lineHeight: 1.2,
  },
  pillActive: {
    border: `1.5px solid ${C.textPrimary}`,
    backgroundColor: C.bgSubtle,
    color: C.textPrimary,
  },
  pillSub: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: "inherit",
  },
  customWrap: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "10px",
    border: `1.5px solid ${C.textPrimary}`,
    borderRadius: "8px",
    padding: "0 14px",
    height: "52px",
  },
  customPrefix: {
    fontSize: "18px",
    fontWeight: 700,
    color: C.textPrimary,
  },
  customInput: {
    flex: 1,
    minWidth: 0,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "18px",
    fontWeight: 700,
    color: C.textPrimary,
    height: "100%",
  },
  payBreakdown: {
    marginTop: "18px",
    border: `1px solid ${C.border}`,
    backgroundColor: C.bgSubtle,
    borderRadius: "8px",
    padding: "6px 18px",
  },
  payBreakRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottom: `1px solid ${C.border}`,
    padding: "13px 0",
  },
  amountDueLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "4px",
  },
  payLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: C.textMuted,
    textTransform: "uppercase" as const,
  },
  payValue: {
    fontSize: "18px",
    fontWeight: 700,
    color: C.textPrimary,
  },
  depositLink: {
    display: "block",
    marginTop: "16px",
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: C.textMuted,
    textAlign: "center" as const,
    textDecoration: "none",
  },
};
