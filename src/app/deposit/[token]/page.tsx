"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";

interface LineItem {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface DepositData {
  id: string;
  deposit_request_number: string;
  client_name: string;
  client_email: string;
  total_amount: number;
  deposit_amount: number;
  balance_remaining: number;
  line_items?: LineItem[] | null;
  payment_instructions: string;
  notes: string;
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

export default function DepositPage() {
  const [data, setData] = useState<DepositData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [depositToken, setDepositToken] = useState("");
  const [paymentParam, setPaymentParam] = useState<"success" | "cancelled" | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

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
        else setData(d);
      })
      .catch(() => setError("Failed to load deposit request"))
      .finally(() => setLoading(false));
  }, []);

  const handlePayDeposit = async () => {
    if (!depositToken || checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositToken }),
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
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.outer}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.rule} />
          <div style={s.mutedText}>Loading your deposit request...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={s.page}>
        <div style={s.outer}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.tagline}>Made by three, worn by all.</div>
          <div style={s.rule} />
          <div style={s.eyebrow}>ERROR</div>
          <div style={s.headline}>REQUEST NOT FOUND</div>
          <div style={s.bodyText}>
            This link may be invalid or expired. Contact your Threefold
            representative.
          </div>
        </div>
      </div>
    );
  }

  const isPaid = data.status === "paid";
  const isPending = data.status === "pending";
  const depositPercent = data.total_amount > 0
    ? Math.round((data.deposit_amount / data.total_amount) * 100)
    : 50;

  return (
    <div style={s.page}>
      <div style={s.outer}>
        <div style={s.headerBlock}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.tagline}>Made by three, worn by all.</div>
        </div>

        <div style={s.rule} />

        <div style={s.eyebrow}>DEPOSIT REQUEST</div>
        <div style={s.headline}>{data.client_name.toUpperCase()}</div>

        <div style={s.summaryStrip}>
          <div style={s.chip}>
            <div style={s.chipLabel}>REQUEST NUMBER</div>
            <div style={s.chipValue}>{data.deposit_request_number}</div>
          </div>
          <div style={s.chip}>
            <div style={s.chipLabel}>STATUS</div>
            <div style={{ ...s.chipValue, color: isPaid ? "#1a6644" : isPending ? "#1a4a7a" : "#7A4A00" }}>
              {isPaid ? "PAID ✓" : isPending ? "PROCESSING" : "AWAITING PAYMENT"}
            </div>
          </div>
        </div>

        <div style={s.rule} />

        {/* Itemized pricing — only shown when line items were saved with this deposit request */}
        {data.line_items && data.line_items.length > 0 && (
          <>
            <div style={s.section}>
              <div style={s.eyebrow}>WHAT&apos;S INCLUDED</div>
              <div style={s.detailList}>
                {data.line_items.map((item, i) => (
                  <div key={i} style={s.detailRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.detailKey}>{item.name.toUpperCase()}</div>
                      {item.description && (
                        <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "2px" }}>
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
            <div style={s.rule} />
          </>
        )}

        {/* Payment breakdown */}
        <div style={s.section}>
          <div style={s.eyebrow}>PAYMENT BREAKDOWN</div>
          <div style={s.detailList}>
            <div style={s.detailRow}>
              <span style={s.detailKey}>TOTAL PROJECT VALUE</span>
              <span style={s.detailVal}>{fmt(data.total_amount)}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailKey}>
                DEPOSIT REQUIRED ({depositPercent}%)
              </span>
              <span style={s.detailVal}>{fmt(data.deposit_amount)}</span>
            </div>
            <div style={s.detailRow}>
              <span style={s.detailKey}>BALANCE DUE ON COMPLETION</span>
              <span style={s.detailVal}>{fmt(data.balance_remaining)}</span>
            </div>
          </div>

          {!isPaid ? (
            <div style={s.calloutPending}>
              <span style={s.calloutLabel}>DEPOSIT DUE</span>
              <span style={s.calloutAmountPending}>{fmt(data.deposit_amount)}</span>
            </div>
          ) : (
            <div style={s.calloutPaid}>
              <span style={{ ...s.calloutLabel, color: "#1a5c3a" }}>DEPOSIT</span>
              <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
            </div>
          )}
        </div>

        <div style={s.rule} />

        {/* Payment action section */}
        {isPaid && (
          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT RECEIVED</div>
            <div style={s.bodyText}>
              Your deposit has been received and confirmed. Threefold Supply Co. will
              be in touch with next steps for your project.
            </div>
          </div>
        )}

        {isPending && !isPaid && (
          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT IN PROGRESS</div>
            <div style={s.bodyText}>
              Your bank transfer is being processed. ACH payments typically settle
              within 3–5 business days. You will receive confirmation once the
              payment clears.
            </div>
          </div>
        )}

        {!isPaid && !isPending && paymentParam === "success" && (
          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT RECEIVED</div>
            <div style={s.bodyText}>
              Your payment is being confirmed. Bank transfers may take a moment to
              process — this page will reflect the updated status once confirmed.
              No further action is needed.
            </div>
          </div>
        )}

        {!isPaid && !isPending && paymentParam === "cancelled" && (
          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT CANCELLED</div>
            <div style={s.bodyText}>
              Your payment was not completed. You can try again whenever you are ready.
            </div>
            {checkoutError && (
              <div style={{ ...s.bodyText, color: "#b91c1c", marginTop: "8px" }}>
                {checkoutError}
              </div>
            )}
            <button
              onClick={() => void handlePayDeposit()}
              disabled={checkoutLoading}
              style={checkoutLoading ? { ...s.btnPay, opacity: 0.6, cursor: "not-allowed" } : s.btnPay}
            >
              {checkoutLoading ? "REDIRECTING TO CHECKOUT…" : `PAY DEPOSIT — ${fmt(data.deposit_amount)} →`}
            </button>
          </div>
        )}

        {!isPaid && !isPending && paymentParam === null && (
          <div style={s.section}>
            <PaymentOptionsPanel
              amount={data.deposit_amount}
              onPayStripe={() => void handlePayDeposit()}
              checkoutLoading={checkoutLoading}
              checkoutError={checkoutError || undefined}
              paymentInstructions={data.payment_instructions || undefined}
            />
          </div>
        )}

        {data.notes && (
          <>
            <div style={s.rule} />
            <div style={s.section}>
              <div style={s.eyebrow}>NOTES</div>
              <div style={s.notesBlock}>{data.notes}</div>
            </div>
          </>
        )}

        <div style={s.rule} />

        <div style={s.eyebrow}>QUESTIONS?</div>
        <div style={s.bodyText}>
          Reach out to your Threefold representative directly.
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
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    backgroundColor: "#F7F3EC",
    minHeight: "100vh",
    fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif',
    color: "#0a0a0a",
  },
  outer: { maxWidth: "860px", margin: "0 auto", padding: "64px 40px 96px" },
  headerBlock: { marginBottom: "8px" },
  logo: {
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    color: "#0a0a0a",
    marginBottom: "4px",
  },
  tagline: { fontSize: "11px", letterSpacing: "0.08em", color: "#6F685D" },
  rule: { height: "1px", backgroundColor: "#DDD6CB", margin: "36px 0" },
  section: { marginBottom: "4px" },
  eyebrow: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.28em",
    color: "#C49A2B",
    marginBottom: "14px",
  },
  headline: {
    fontSize: "56px",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    lineHeight: 1,
    textTransform: "uppercase" as const,
    marginBottom: "10px",
  },
  summaryStrip: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "10px",
    marginTop: "20px",
  },
  chip: {
    border: "1px solid #DDD6CB",
    padding: "10px 16px",
    backgroundColor: "#FAF7F2",
  },
  chipLabel: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.24em",
    color: "#9B9084",
    textTransform: "uppercase" as const,
    marginBottom: "4px",
  },
  chipValue: { fontSize: "15px", fontWeight: 600, color: "#0a0a0a" },
  detailList: { display: "flex", flexDirection: "column" as const },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottom: "1px solid #E5DDD2",
    padding: "12px 0",
  },
  detailKey: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "#6F685D",
  },
  detailVal: { fontSize: "15px", fontWeight: 600, color: "#0a0a0a" },
  calloutPending: {
    marginTop: "14px",
    border: "1px solid #D4A96A",
    backgroundColor: "#FDF6EC",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calloutPaid: {
    marginTop: "14px",
    border: "1px solid #8BC4A4",
    backgroundColor: "#EBF5EF",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calloutLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "#7A4A00",
  },
  calloutAmountPending: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#7A4A00",
    letterSpacing: "-0.01em",
  },
  calloutAmountPaid: {
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "#1a5c3a",
  },
  bodyText: {
    fontSize: "15px",
    color: "#3F3A33",
    lineHeight: 1.75,
    marginBottom: "12px",
  },
  notesBlock: {
    fontSize: "14px",
    color: "#332E28",
    lineHeight: 1.75,
    borderLeft: "2px solid #C49A2B",
    paddingLeft: "16px",
    marginTop: "4px",
  },
  btnOutline: {
    display: "inline-block",
    marginTop: "16px",
    border: "1.5px solid #0a0a0a",
    color: "#0a0a0a",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    padding: "14px 32px",
    textDecoration: "none",
  },
  mutedText: {
    fontSize: "12px",
    color: "#6F685D",
    letterSpacing: "0.05em",
    marginTop: "16px",
  },
  btnPay: {
    display: "block",
    width: "100%",
    marginTop: "20px",
    backgroundColor: "#C49A2B",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    padding: "16px 32px",
    border: "none",
    cursor: "pointer",
    textAlign: "center" as const,
  },
  footerLogo: {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    color: "#756D62",
    marginBottom: "4px",
  },
  footerTagline: {
    fontSize: "10px",
    color: "#7F776B",
    letterSpacing: "0.06em",
  },
};
