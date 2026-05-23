"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";

interface InvoiceData {
  id: string;
  order_name: string;
  client_name: string;
  total_amount: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  balance_remaining: number;
  final_paid: boolean;
  final_paid_date: string | null;
  final_due_date: string | null;
  status: string;
  notes: string;
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

export default function InvoicePage() {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
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

  if (loading) {
    return (
      <PortalShell>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your invoice...</div>
      </PortalShell>
    );
  }

  if (error || !data) {
    return (
      <PortalShell>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
        <div style={s.rule} />
        <div style={s.eyebrow}>ERROR</div>
        <div style={s.headline}>INVOICE NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold
          representative.
        </div>
      </PortalShell>
    );
  }

  const isPaidInFull = data.final_paid;
  const isDepositPaid = data.deposit_paid;
  const isOverdue = data.final_due_date
    ? !isPaidInFull && new Date(data.final_due_date + "T23:59:59") < new Date()
    : false;

  const statusLabel = isPaidInFull
    ? "PAID IN FULL ✓"
    : isDepositPaid
    ? "DEPOSIT PAID"
    : "BALANCE DUE";

  const statusColor = isPaidInFull ? "#1a6644" : isOverdue ? "#b91c1c" : "#7A4A00";

  return (
    <PortalShell>
      {/* Full-width header */}
      <div style={s.headerBlock}>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
      </div>

      <div style={s.rule} />

      <div style={s.eyebrow}>FINAL INVOICE</div>
      <div style={s.headline}>{data.client_name.toUpperCase()}</div>

      <div style={s.summaryStrip}>
        {data.order_name && (
          <div style={s.chip}>
            <div style={s.chipLabel}>PROJECT</div>
            <div style={s.chipValue}>{data.order_name}</div>
          </div>
        )}
        <div style={s.chip}>
          <div style={s.chipLabel}>TOTAL</div>
          <div style={s.chipValue}>{fmt(data.total_amount)}</div>
        </div>
        <div style={s.chip}>
          <div style={s.chipLabel}>STATUS</div>
          <div style={{ ...s.chipValue, color: statusColor }}>{statusLabel}</div>
        </div>
      </div>

      <div style={s.rule} />

      {/* Two-column body */}
      <div className="portal-columns">

        {/* Left: payment summary */}
        <div className="portal-col-main">
          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT SUMMARY</div>
            <div style={s.detailList}>
              <div style={s.detailRow}>
                <span style={s.detailKey}>TOTAL PROJECT VALUE</span>
                <span style={s.detailVal}>{fmt(data.total_amount)}</span>
              </div>
              <div style={s.detailRow}>
                <div style={{ flex: 1 }}>
                  <span style={s.detailKey}>DEPOSIT</span>
                  {isDepositPaid && data.deposit_paid_date && (
                    <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "2px" }}>
                      Paid {fmtDate(data.deposit_paid_date)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                  <span style={s.detailVal}>{fmt(data.deposit_amount)}</span>
                  {isDepositPaid && (
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", color: "#1a6644", marginTop: "2px" }}>
                      PAID ✓
                    </div>
                  )}
                </div>
              </div>
              <div style={s.detailRow}>
                <div style={{ flex: 1 }}>
                  <span style={{ ...s.detailKey, color: isPaidInFull ? "#1a6644" : "#0a0a0a", fontWeight: 700 }}>
                    BALANCE REMAINING
                  </span>
                  {data.final_due_date && !isPaidInFull && (
                    <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "2px", color: isOverdue ? "#b91c1c" : "#6F685D" }}>
                      Due {fmtDate(data.final_due_date)}{isOverdue ? " — OVERDUE" : ""}
                    </div>
                  )}
                  {isPaidInFull && data.final_paid_date && (
                    <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "2px" }}>
                      Paid {fmtDate(data.final_paid_date)}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: "16px" }}>
                  {isPaidInFull ? (
                    <span style={{ ...s.detailVal, color: "#1a6644" }}>PAID IN FULL ✓</span>
                  ) : (
                    <span style={{ ...s.detailVal, fontSize: "18px" }}>{fmt(data.balance_remaining)}</span>
                  )}
                </div>
              </div>
            </div>

            {!isPaidInFull ? (
              <div style={s.calloutPending}>
                <span style={s.calloutLabel}>BALANCE DUE</span>
                <span style={s.calloutAmountPending}>{fmt(data.balance_remaining)}</span>
              </div>
            ) : (
              <div style={s.calloutPaid}>
                <span style={{ ...s.calloutLabel, color: "#1a5c3a" }}>INVOICE</span>
                <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: how to pay + notes + contact */}
        <div className="portal-col-side">
          {isPaidInFull ? (
            <div style={s.section}>
              <div style={s.eyebrow}>PAYMENT RECEIVED</div>
              <div style={s.bodyText}>
                Your final payment has been received and confirmed. Thank you for
                your business — it&apos;s been a pleasure working with you.
              </div>
            </div>
          ) : (
            <div style={s.section}>
              <div style={s.eyebrow}>HOW TO PAY</div>

              {/* Check */}
              <div style={s.altLabel}>CHECK</div>
              <div style={s.bodyText}>Make checks payable to:</div>
              <div style={s.checkPayee}>ThreeFold Supply Co.</div>
              <div style={{ ...s.bodyText, marginTop: "12px" }}>Mail checks to:</div>
              <div style={s.checkAddress}>
                1957 California St Apt 6<br />
                Mountain View, CA 94040
              </div>
            </div>
          )}

          {data.notes && (
            <>
              <div className="col-rule" />
              <div style={s.section}>
                <div style={s.eyebrow}>NOTES</div>
                <div style={s.notesBlock}>{data.notes}</div>
              </div>
            </>
          )}

          <div className="col-rule" />
          <div style={s.eyebrow}>QUESTIONS?</div>
          <div style={s.bodyText}>
            Reach out to your Threefold representative directly.
          </div>
          <a
            href={`mailto:${BUSINESS_EMAIL}?subject=Re: Invoice — ${data.order_name || data.client_name}`}
            style={s.btnOutline}
          >
            CONTACT THREEFOLD →
          </a>
        </div>
      </div>

      {/* Full-width footer */}
      <div style={s.rule} />
      <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
      <div style={s.footerTagline}>Made by three, worn by all.</div>
    </PortalShell>
  );
}

const s: Record<string, React.CSSProperties> = {
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
  altLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "#332E28",
    marginBottom: "6px",
  },
  checkPayee: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#1a1a1a",
    letterSpacing: "0.02em",
    marginBottom: "4px",
  },
  checkAddress: {
    fontSize: "13px",
    color: "#3F3A33",
    lineHeight: 1.75,
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
  footerLogo: {
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    color: "#756D62",
    marginBottom: "4px",
  },
  footerTagline: { fontSize: "10px", color: "#7F776B", letterSpacing: "0.06em" },
};
