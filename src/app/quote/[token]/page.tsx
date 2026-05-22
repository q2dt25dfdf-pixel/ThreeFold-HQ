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

interface QuoteData {
  id: string;
  quote_number: string;
  client_name: string;
  client_email: string;
  items: string[];
  line_items?: LineItem[] | null;
  total_amount: number;
  expiration_date: string;
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

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function QuotePage() {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.location.pathname.split("/").pop() ?? "";
    if (!token) return;

    fetch(`/api/quote/${token}`)
      .then((r) => r.json())
      .then((d: QuoteData & { error?: string }) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load quote"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.outer}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.rule} />
          <div style={s.mutedText}>Loading your quote...</div>
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
          <div style={s.headline}>QUOTE NOT FOUND</div>
          <div style={s.bodyText}>
            This link may be invalid or expired. Contact your Threefold
            representative.
          </div>
        </div>
      </div>
    );
  }

  const isExpired = data.expiration_date
    ? new Date(data.expiration_date + "T23:59:59") < new Date()
    : false;

  return (
    <>
      <style>{`
        .col-rule { height: 1px; background-color: #DDD6CB; margin: 36px 0; }
        @media (max-width: 767px) {
          .portal-col-side { border-top: 1px solid #DDD6CB; margin-top: 36px; padding-top: 36px; }
        }
        @media (min-width: 768px) {
          .portal-columns { display: grid; grid-template-columns: 1fr 320px; gap: 0 64px; align-items: start; }
        }
      `}</style>
      <div style={s.page}>
        <div style={s.outer}>

          {/* Full-width header */}
          <div style={s.headerBlock}>
            <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
            <div style={s.tagline}>Made by three, worn by all.</div>
          </div>

          <div style={s.rule} />

          <div style={s.eyebrow}>CUSTOM QUOTE</div>
          <div style={s.headline}>{data.client_name.toUpperCase()}</div>

          <div style={s.summaryStrip}>
            <div style={s.chip}>
              <div style={s.chipLabel}>QUOTE NUMBER</div>
              <div style={s.chipValue}>{data.quote_number}</div>
            </div>
            <div style={s.chip}>
              <div style={s.chipLabel}>TOTAL</div>
              <div style={s.chipValue}>{fmt(data.total_amount)}</div>
            </div>
            {data.expiration_date && (
              <div style={s.chip}>
                <div style={s.chipLabel}>VALID THROUGH</div>
                <div style={{ ...s.chipValue, color: isExpired ? "#b91c1c" : "#0a0a0a" }}>
                  {fmtDate(data.expiration_date)}
                  {isExpired ? " — EXPIRED" : ""}
                </div>
              </div>
            )}
          </div>

          <div style={s.rule} />

          {/* Two-column body */}
          <div className="portal-columns">

            {/* Left column: pricing summary */}
            <div className="portal-col-main">
              <div style={s.section}>
                <div style={s.eyebrow}>PRICING SUMMARY</div>
                <div style={s.detailList}>
                  {data.line_items && data.line_items.length > 0 ? (
                    <>
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
                      <div style={{ ...s.detailRow, marginTop: "4px" }}>
                        <span style={{ ...s.detailKey, color: "#0a0a0a", fontWeight: 700 }}>
                          TOTAL PROJECT VALUE
                        </span>
                        <span style={{ ...s.detailVal, fontSize: "18px" }}>
                          {fmt(data.total_amount)}
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
                      <div style={{ ...s.detailRow, marginTop: "4px" }}>
                        <span style={{ ...s.detailKey, color: "#0a0a0a", fontWeight: 700 }}>
                          TOTAL PROJECT VALUE
                        </span>
                        <span style={{ ...s.detailVal, fontSize: "18px" }}>
                          {fmt(data.total_amount)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div style={s.paymentCallout}>
                  <span style={s.paymentCalloutLabel}>QUOTE TOTAL</span>
                  <span style={s.paymentCalloutAmount}>{fmt(data.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* Right column: next steps + CTA */}
            <div className="portal-col-side">
              <div style={s.section}>
                <div style={s.eyebrow}>NEXT STEPS</div>
                <div style={s.bodyText}>
                  Review this quote and reach out to approve it. Once approved, we
                  will send a deposit request to get your project into production.
                </div>
                {data.notes && (
                  <div style={s.notesBlock}>
                    {data.notes}
                  </div>
                )}
              </div>

              <div className="col-rule" />

              <div style={s.eyebrow}>READY TO MOVE FORWARD?</div>
              <div style={s.bodyText}>
                Reply to the email you received or contact your Threefold
                representative directly.
              </div>
              <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
                CONTACT THREEFOLD →
              </a>
            </div>
          </div>

          {/* Full-width footer */}
          <div style={s.rule} />
          <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.footerTagline}>Made by three, worn by all.</div>

        </div>
      </div>
    </>
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
  tagline: {
    fontSize: "11px",
    letterSpacing: "0.08em",
    color: "#6F685D",
  },
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
  paymentCallout: {
    marginTop: "16px",
    border: "1.5px solid #C49A2B",
    backgroundColor: "#FDF6EC",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentCalloutLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "#7A5A00",
  },
  paymentCalloutAmount: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#7A5A00",
    letterSpacing: "-0.01em",
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
    marginTop: "12px",
  },
  btnGold: {
    display: "inline-block",
    marginTop: "16px",
    backgroundColor: "#C49A2B",
    color: "#fff",
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
