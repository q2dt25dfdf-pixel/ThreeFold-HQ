"use client";

import { useEffect, useState } from "react";
import { BUSINESS_EMAIL } from "@/lib/config";
import PaymentOptionsPanel from "@/components/PaymentOptionsPanel";
import PortalShell from "@/components/PortalShell";
import { C, dk } from "@/lib/clientTheme";

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
  const [checkoutLoading, setCheckoutLoading] = useState<"card" | "bank" | null>(null);
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

  if (loading) {
    return (
      <PortalShell>
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your deposit request...</div>
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
        <div style={s.headline}>REQUEST NOT FOUND</div>
        <div style={s.bodyText}>
          This link may be invalid or expired. Contact your Threefold
          representative.
        </div>
      </PortalShell>
    );
  }

  const isPaid = data.status === "paid";
  const isPending = data.status === "pending";
  const depositPercent = data.total_amount > 0
    ? Math.round((data.deposit_amount / data.total_amount) * 100)
    : 50;

  return (
    <PortalShell>
      {/* Full-width header */}
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
              <div className="col-rule" />
            </>
          )}

          <div style={s.section}>
            <div style={s.eyebrow}>PAYMENT BREAKDOWN</div>
            <div style={s.detailList}>
              <div style={s.detailRow}>
                <span style={s.detailKey}>TOTAL PROJECT VALUE</span>
                <span style={s.detailVal}>{fmt(data.total_amount)}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailKey}>DEPOSIT REQUIRED ({depositPercent}%)</span>
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
                <span style={{ ...s.calloutLabel, color: C.green }}>DEPOSIT</span>
                <span style={s.calloutAmountPaid}>PAID IN FULL ✓</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: payment action + notes + questions */}
        <div className="portal-col-side">
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
              <PaymentOptionsPanel
                amount={data.deposit_amount}
                label="DEPOSIT AMOUNT"
                eyebrow=""
                onPayCard={() => void handlePay("card")}
                onPayBank={() => void handlePay("bank")}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError || undefined}
              />
            </div>
          )}

          {!isPaid && !isPending && paymentParam === null && (
            <div style={s.section}>
              <PaymentOptionsPanel
                amount={data.deposit_amount}
                label="DEPOSIT AMOUNT"
                onPayCard={() => void handlePay("card")}
                onPayBank={() => void handlePay("bank")}
                checkoutLoading={checkoutLoading}
                checkoutError={checkoutError || undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* Full-width: Notes */}
      {data.notes && (
        <>
          <div style={s.rule} />
          <div style={s.eyebrow}>NOTES</div>
          <div style={s.notesBlock}>{data.notes}</div>
        </>
      )}

      {/* Full-width: Questions */}
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

      {/* Full-width footer */}
      <div style={s.rule} />
      <div style={s.footerLogo}>THREEFOLD SUPPLY CO.</div>
      <div style={s.footerTagline}>Made by three, worn by all.</div>
    </PortalShell>
  );
}

const s: Record<string, React.CSSProperties> = {
  ...dk,
};
