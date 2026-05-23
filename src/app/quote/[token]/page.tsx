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
                    <span style={{ ...s.detailVal, fontSize: "20px" }}>
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
                    <span style={{ ...s.detailVal, fontSize: "20px" }}>
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
          <div className="dk-card">
            <div style={s.cardEyebrow}>NEXT STEPS</div>
            <div style={s.bodyText}>
              Review this quote and reach out to approve it. Once approved, we
              will send a deposit request to get your project into production.
            </div>
            {data.notes && (
              <div style={s.notesBlock}>{data.notes}</div>
            )}
          </div>

          <div className="dk-card">
            <div style={s.cardEyebrow}>READY TO MOVE FORWARD?</div>
            <div style={s.bodyText}>
              Reply to the email you received or contact your Threefold
              representative directly.
            </div>
            <a href={`mailto:${BUSINESS_EMAIL}?subject=Re: Quote ${data.quote_number}`} style={s.btnGold}>
              CONTACT THREEFOLD →
            </a>
          </div>
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
};
