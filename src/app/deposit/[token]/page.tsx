"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";

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

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
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
            <div style={{ ...s.chipValue, color: isPaid ? "#1a6644" : "#7A4A00" }}>
              {isPaid ? "PAID ✓" : "AWAITING PAYMENT"}
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

        {/* Payment instructions */}
        <div style={s.section}>
          <div style={s.eyebrow}>HOW TO PAY</div>
          {data.payment_instructions ? (
            <div style={s.notesBlock}>{data.payment_instructions}</div>
          ) : (
            <div style={s.bodyText}>
              Please contact your Threefold representative to arrange payment.
              We accept Venmo, Zelle, check, and bank transfer.
            </div>
          )}
        </div>

        {/* Future Stripe integration anchor */}
        {/* TODO: replace this section with <StripePaymentButton amount={data.deposit_amount} /> */}

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
  outer: { maxWidth: "680px", margin: "0 auto", padding: "64px 32px 96px" },
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
    fontSize: "48px",
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
  chipValue: { fontSize: "14px", fontWeight: 600, color: "#0a0a0a" },
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
  detailVal: { fontSize: "14px", fontWeight: 600, color: "#0a0a0a" },
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
    fontSize: "14px",
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
