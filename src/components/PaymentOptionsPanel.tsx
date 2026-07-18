"use client";

import { C } from "@/lib/clientTheme";

interface PaymentOptionsPanelProps {
  amount: number;
  label?: string;
  eyebrow?: string;
  onPayCard: () => void;
  onPayBank: () => void;
  checkoutLoading: "card" | "bank" | null;
  checkoutError?: string;
  // Optional interactive check flow (approved-quote page). When onDeclareCheck is
  // omitted (e.g. the deposit portal), the check block stays a static address card.
  onDeclareCheck?: () => void;
  checkDeclared?: boolean;
  checkLoading?: boolean;
  checkMemo?: string;
  onResetMethod?: () => void;
}

function fmt(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function PaymentOptionsPanel({
  amount,
  label = "AMOUNT DUE",
  eyebrow = "PAY YOUR DEPOSIT",
  onPayCard,
  onPayBank,
  checkoutLoading,
  checkoutError,
  onDeclareCheck,
  checkDeclared = false,
  checkLoading = false,
  checkMemo,
  onResetMethod,
}: PaymentOptionsPanelProps) {
  const cardFee = Math.round(amount * 0.03 * 100) / 100;
  const cardTotal = amount + cardFee;
  const isLoading = checkoutLoading !== null || checkLoading;

  // Check declared: this is a DECLARATION, not a payment. No card fee, no Stripe —
  // just where to mail it and what happens next. A way back to card/bank is offered.
  if (checkDeclared) {
    return (
      <div>
        {eyebrow && <div style={s.eyebrow}>{eyebrow}</div>}
        <div style={s.checkBlock}>
          <div style={s.altLabel}>MAIL A CHECK</div>
          <div style={s.optionBody}>Make checks payable to:</div>
          <div style={s.checkPayee}>ThreeFold Supply Co.</div>
          <div style={{ ...s.optionBody, marginTop: "16px" }}>Mail checks to:</div>
          <div style={s.checkAddress}>
            1957 California St Apt 6<br />
            Mountain View, CA 94040
          </div>
          <div style={s.checkDetailRow}>
            <span style={s.breakdownKey}>AMOUNT</span>
            <span style={s.breakdownVal}>{fmt(amount)}</span>
          </div>
          {checkMemo && (
            <div style={{ ...s.checkDetailRow, borderBottom: "none" }}>
              <span style={s.breakdownKey}>MEMO</span>
              <span style={{ ...s.breakdownVal, fontSize: "14px" }}>{checkMemo}</span>
            </div>
          )}
          <div style={s.checkNote}>
            Production starts once your check clears. You&apos;ll receive a receipt the day it does.
          </div>
        </div>
        {onResetMethod && (
          <button onClick={onResetMethod} style={s.btnBackMethod}>
            ‹ CHOOSE A DIFFERENT METHOD
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {eyebrow && (
        <div style={s.eyebrow}>{eyebrow}</div>
      )}

      {/* Fee breakdown */}
      <div style={s.breakdownBlock}>
        <div style={s.breakdownRow}>
          <span style={s.breakdownKey}>{label}</span>
          <span style={s.breakdownVal}>{fmt(amount)}</span>
        </div>
        <div style={s.breakdownRow}>
          <span style={s.breakdownKey}>CARD FEE (3%)</span>
          <span style={{ ...s.breakdownVal, color: C.textSecondary }}>{fmt(cardFee)}</span>
        </div>
        <div style={{ ...s.breakdownRow, borderBottom: "none", paddingBottom: 0 }}>
          <span style={{ ...s.breakdownKey, color: C.textPrimary }}>TOTAL IF PAYING BY CARD</span>
          <span style={{ ...s.breakdownVal, color: C.textPrimary }}>{fmt(cardTotal)}</span>
        </div>
        <div style={s.bankRow}>
          <span style={s.breakdownKey}>BANK ACCOUNT PAYMENT</span>
          <span style={{ ...s.breakdownVal, color: C.green }}>{fmt(amount)}</span>
        </div>
      </div>

      <div style={s.feeNotice}>
        * Card payments include a 3% processing fee. Bank account payments and checks do not.
      </div>

      {checkoutError && <div style={s.errorText}>{checkoutError}</div>}

      <button
        onClick={onPayCard}
        disabled={isLoading}
        style={isLoading ? { ...s.btnCard, opacity: 0.5, cursor: "not-allowed" } : s.btnCard}
      >
        {checkoutLoading === "card"
          ? "REDIRECTING TO CHECKOUT…"
          : `PAY BY CARD (+3%) — ${fmt(cardTotal)} →`}
      </button>

      <button
        onClick={onPayBank}
        disabled={isLoading}
        style={isLoading ? { ...s.btnBank, opacity: 0.5, cursor: "not-allowed" } : s.btnBank}
      >
        {checkoutLoading === "bank"
          ? "REDIRECTING TO CHECKOUT…"
          : `PAY BY BANK ACCOUNT — ${fmt(amount)} →`}
      </button>

      {/* Check option */}
      <div style={s.altHeader}>OTHER PAYMENT OPTIONS</div>
      <div style={s.checkBlock}>
        <div style={s.altLabel}>CHECK</div>
        <div style={s.optionBody}>Make checks payable to:</div>
        <div style={s.checkPayee}>ThreeFold Supply Co.</div>
        <div style={{ ...s.optionBody, marginTop: "16px" }}>Mail checks to:</div>
        <div style={s.checkAddress}>
          1957 California St Apt 6<br />
          Mountain View, CA 94040
        </div>
        {onDeclareCheck && (
          <button
            onClick={onDeclareCheck}
            disabled={isLoading}
            style={isLoading ? { ...s.btnCheck, opacity: 0.5, cursor: "not-allowed" } : s.btnCheck}
          >
            {checkLoading ? "SAVING…" : "I'LL MAIL A CHECK →"}
          </button>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  eyebrow: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: C.textPrimary,
    marginBottom: "20px",
    textTransform: "uppercase" as const,
  },
  breakdownBlock: {
    border: `1px solid ${C.border}`,
    backgroundColor: C.bgSubtle,
    padding: "20px 24px",
    marginBottom: "16px",
    borderRadius: "8px",
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottom: `1px solid ${C.border}`,
    padding: "12px 0",
  },
  breakdownKey: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    color: C.textMuted,
    textTransform: "uppercase" as const,
  },
  breakdownVal: {
    fontSize: "16px",
    fontWeight: 700,
    color: C.textPrimary,
  },
  bankRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: "14px",
    paddingTop: "14px",
    borderTop: `1px dashed ${C.greenBorder}`,
  },
  feeNotice: {
    fontSize: "11px",
    fontStyle: "italic",
    color: C.textMuted,
    lineHeight: 1.6,
    marginBottom: "20px",
    opacity: 0.8,
  },
  errorText: {
    fontSize: "13px",
    color: C.red,
    marginBottom: "12px",
    lineHeight: 1.5,
  },
  btnCard: {
    display: "block",
    width: "100%",
    backgroundColor: "#ffffff",
    color: C.textPrimary,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.20em",
    padding: "17px 32px",
    border: `1.5px solid ${C.textPrimary}`,
    cursor: "pointer",
    textAlign: "center" as const,
    marginBottom: "10px",
    borderRadius: "8px",
  },
  btnBank: {
    display: "block",
    width: "100%",
    backgroundColor: "transparent",
    color: C.greenText,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.20em",
    padding: "17px 32px",
    border: `1.5px solid ${C.green}`,
    cursor: "pointer",
    textAlign: "center" as const,
    marginBottom: "32px",
    borderRadius: "8px",
  },
  altHeader: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.24em",
    color: C.textMuted,
    marginBottom: "14px",
    textTransform: "uppercase" as const,
  },
  checkBlock: {
    border: `1px solid ${C.border}`,
    backgroundColor: "#ffffff",
    padding: "22px 24px 26px",
    borderRadius: "8px",
  },
  altLabel: {
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: C.textSecondary,
    marginBottom: "10px",
  },
  checkPayee: {
    fontSize: "15px",
    fontWeight: 700,
    color: C.textPrimary,
    letterSpacing: "0.02em",
    marginBottom: "4px",
  },
  checkAddress: {
    fontSize: "14px",
    color: C.textSecondary,
    lineHeight: 1.75,
  },
  optionBody: {
    fontSize: "13px",
    color: C.textSecondary,
    lineHeight: 1.65,
    marginBottom: "4px",
  },
  btnCheck: {
    display: "block",
    width: "100%",
    minHeight: "48px",
    marginTop: "20px",
    backgroundColor: "transparent",
    color: C.textPrimary,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    padding: "15px 24px",
    border: `1.5px solid ${C.textSecondary}`,
    cursor: "pointer",
    textAlign: "center" as const,
    borderRadius: "8px",
  },
  checkDetailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottom: `1px solid ${C.border}`,
    padding: "14px 0",
    marginTop: "18px",
  },
  checkNote: {
    fontSize: "13px",
    color: C.textSecondary,
    lineHeight: 1.6,
    marginTop: "18px",
  },
  btnBackMethod: {
    display: "block",
    width: "100%",
    minHeight: "48px",
    marginTop: "16px",
    background: "none",
    border: "none",
    color: C.textMuted,
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    cursor: "pointer",
    textAlign: "center" as const,
    textTransform: "uppercase" as const,
  },
};
