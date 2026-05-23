"use client";

interface PaymentOptionsPanelProps {
  amount: number;
  label?: string;
  eyebrow?: string;
  onPayCard: () => void;
  onPayBank: () => void;
  checkoutLoading: "card" | "bank" | null;
  checkoutError?: string;
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
}: PaymentOptionsPanelProps) {
  const cardFee = Math.round(amount * 0.03 * 100) / 100;
  const cardTotal = amount + cardFee;
  const isLoading = checkoutLoading !== null;

  return (
    <div>
      {eyebrow && <div style={s.eyebrow}>{eyebrow}</div>}

      {/* Fee breakdown */}
      <div style={s.breakdownBlock}>
        <div style={s.breakdownRow}>
          <span style={s.breakdownKey}>{label}</span>
          <span style={s.breakdownVal}>{fmt(amount)}</span>
        </div>
        <div style={s.breakdownRow}>
          <span style={s.breakdownKey}>CARD FEE (3%)</span>
          <span style={s.breakdownVal}>{fmt(cardFee)}</span>
        </div>
        <div style={{ ...s.breakdownRow, borderBottom: "none", paddingBottom: 0 }}>
          <span style={{ ...s.breakdownKey, color: "#7A4A00" }}>TOTAL IF PAYING BY CARD</span>
          <span style={{ ...s.breakdownVal, color: "#7A4A00" }}>{fmt(cardTotal)}</span>
        </div>
        <div style={s.bankRow}>
          <span style={s.breakdownKey}>BANK ACCOUNT PAYMENT</span>
          <span style={{ ...s.breakdownVal, color: "#1a6644" }}>{fmt(amount)}</span>
        </div>
      </div>

      <div style={s.feeNotice}>
        Card payments include a 3% processing fee. Bank account payments do not.
      </div>

      {checkoutError && <div style={s.errorText}>{checkoutError}</div>}

      <button
        onClick={onPayCard}
        disabled={isLoading}
        style={isLoading ? { ...s.btnCard, opacity: 0.6, cursor: "not-allowed" } : s.btnCard}
      >
        {checkoutLoading === "card"
          ? "REDIRECTING TO CHECKOUT…"
          : `PAY BY CARD (+3%) — ${fmt(cardTotal)} →`}
      </button>

      <button
        onClick={onPayBank}
        disabled={isLoading}
        style={isLoading ? { ...s.btnBank, opacity: 0.6, cursor: "not-allowed" } : s.btnBank}
      >
        {checkoutLoading === "bank"
          ? "REDIRECTING TO CHECKOUT…"
          : `PAY BY BANK ACCOUNT — ${fmt(amount)} →`}
      </button>

      {/* Check */}
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
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  eyebrow: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.28em",
    color: "#C49A2B",
    marginBottom: "14px",
  },
  breakdownBlock: {
    border: "1px solid #D4A96A",
    backgroundColor: "#FDF6EC",
    padding: "16px 20px",
    marginBottom: "12px",
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottom: "1px solid #e0c98a",
    padding: "9px 0",
  },
  breakdownKey: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "#6F685D",
  },
  breakdownVal: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#0a0a0a",
  },
  bankRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px dashed #c8d8c4",
  },
  feeNotice: {
    fontSize: "11px",
    color: "#4a3200",
    lineHeight: 1.65,
    marginBottom: "12px",
  },
  errorText: {
    fontSize: "12px",
    color: "#b91c1c",
    marginBottom: "10px",
  },
  btnCard: {
    display: "block",
    width: "100%",
    backgroundColor: "#C49A2B",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    padding: "16px 32px",
    border: "none",
    cursor: "pointer",
    textAlign: "center" as const,
    marginBottom: "8px",
  },
  btnBank: {
    display: "block",
    width: "100%",
    backgroundColor: "#fff",
    color: "#1a6644",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    padding: "15px 32px",
    border: "1.5px solid #1a6644",
    cursor: "pointer",
    textAlign: "center" as const,
    marginBottom: "24px",
  },
  altHeader: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.24em",
    color: "#9B9084",
    marginBottom: "16px",
    textTransform: "uppercase" as const,
  },
  checkBlock: {
    border: "1px solid #DDD6CB",
    backgroundColor: "#FAF7F2",
    padding: "20px 20px 24px",
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
  optionBody: {
    fontSize: "13px",
    color: "#3F3A33",
    lineHeight: 1.65,
    marginBottom: "6px",
  },
};
