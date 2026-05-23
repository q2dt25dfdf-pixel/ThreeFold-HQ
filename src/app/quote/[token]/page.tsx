"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PortalShell from "@/components/PortalShell";
import { C, dk } from "@/lib/clientTheme";

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
      <PortalShell>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your quote...</div>
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
        <div style={s.headline}>QUOTE NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold
          representative.
        </div>
      </PortalShell>
    );
  }

  const isExpired = data.expiration_date
    ? new Date(data.expiration_date + "T23:59:59") < new Date()
    : false;

  return (
    <PortalShell>
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
            <div style={{ ...s.chipValue, color: isExpired ? C.red : C.textPrimary }}>
              {fmtDate(data.expiration_date)}
              {isExpired ? " — EXPIRED" : ""}
            </div>
          </div>
        )}
      </div>

      <div style={s.rule} />

      {/* Two-column body */}
      <div className="portal-columns">

        {/* Left: pricing summary */}
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
                          <div style={{ ...s.detailKey, fontWeight: 400, letterSpacing: "0.04em", marginTop: "2px", textTransform: "none" as const }}>
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
                    <span style={{ ...s.detailKey, color: C.textSecondary, fontWeight: 700 }}>
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
                    <span style={{ ...s.detailKey, color: C.textSecondary, fontWeight: 700 }}>
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

        {/* Right: next steps + CTA */}
        <div className="portal-col-side">
          <div style={s.section}>
            <div style={s.eyebrow}>NEXT STEPS</div>
            <div style={s.bodyText}>
              Review this quote and reach out to approve it. Once approved, we
              will send a deposit request to get your project into production.
            </div>
            {data.notes && (
              <div style={s.notesBlock}>{data.notes}</div>
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
    </PortalShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  ...dk,
  paymentCallout: {
    marginTop: "20px",
    border: `1.5px solid ${C.borderGold}`,
    backgroundColor: "rgba(212,163,38,0.07)",
    padding: "18px 22px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentCalloutLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: C.gold,
  },
  paymentCalloutAmount: {
    fontSize: "22px",
    fontWeight: 700,
    color: C.gold,
    letterSpacing: "-0.01em",
  },
};
