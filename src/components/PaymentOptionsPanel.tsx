"use client";

interface PaymentOptionsPanelProps {
  amount: number;
  onPayStripe: () => void;
  checkoutLoading: boolean;
  checkoutError?: string;
  paymentInstructions?: string;
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
  onPayStripe,
  checkoutLoading,
  checkoutError,
  paymentInstructions,
}: PaymentOptionsPanelProps) {
  return (
    <div>
      <div style={s.eyebrow}>PAY YOUR DEPOSIT</div>

      {/* Stripe */}
      <div style={s.stripeBlock}>
        <div style={s.optionLabel}>PAY ONLINE — STRIPE</div>
        <div style={s.optionBody}>
          Pay securely by card or bank account through Stripe.
        </div>
        <div style={s.feeNote}>
          Card payments include a 3% processing fee. Bank account payments do not.
        </div>
        {checkoutError && (
          <div style={s.errorText}>{checkoutError}</div>
        )}
        <button
          onClick={onPayStripe}
          disabled={checkoutLoading}
          style={
            checkoutLoading
              ? { ...s.btnPay, opacity: 0.6, cursor: "not-allowed" }
              : s.btnPay
          }
        >
          {checkoutLoading
            ? "REDIRECTING TO CHECKOUT…"
            : `PAY DEPOSIT — ${fmt(amount)} →`}
        </button>
      </div>

      {/* Check */}
      <div style={s.altHeader}>OTHER PAYMENT OPTIONS</div>
      <div style={s.altBlock}>
        <div style={s.altLabel}>CHECK</div>
        <div style={s.optionBody}>Make checks payable to:</div>
        <div style={s.checkPayee}>ThreeFold Supply Co.</div>
        <div style={{ ...s.optionBody, marginTop: "12px" }}>Mail checks to:</div>
        <div style={s.checkAddress}>
          1957 California St Apt 6<br />
          Mountain View, CA 94040
        </div>
      </div>

      {/* Optional payment notes from the deposit record */}
      {paymentInstructions && (
        <>
          <div style={{ height: "1px", backgroundColor: "#DDD6CB", margin: "28px 0 20px" }} />
          <div style={s.eyebrow}>PAYMENT NOTES</div>
          <div style={s.notesBlock}>{paymentInstructions}</div>
        </>
      )}
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
  stripeBlock: {
    border: "1px solid #D4A96A",
    backgroundColor: "#FDF6EC",
    padding: "20px 20px 24px",
    marginBottom: "24px",
  },
  optionLabel: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "#7A4A00",
    marginBottom: "8px",
  },
  optionBody: {
    fontSize: "13px",
    color: "#3F3A33",
    lineHeight: 1.65,
    marginBottom: "6px",
  },
  feeNote: {
    fontSize: "11px",
    color: "#6F685D",
    lineHeight: 1.6,
    marginTop: "4px",
    marginBottom: "16px",
    fontStyle: "italic",
  },
  errorText: {
    fontSize: "12px",
    color: "#b91c1c",
    marginBottom: "10px",
  },
  btnPay: {
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
    marginTop: "4px",
  },
  altHeader: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.24em",
    color: "#9B9084",
    marginBottom: "16px",
    textTransform: "uppercase" as const,
  },
  altBlock: {
    paddingBottom: "16px",
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
  notesBlock: {
    fontSize: "14px",
    color: "#332E28",
    lineHeight: 1.75,
    borderLeft: "2px solid #C49A2B",
    paddingLeft: "16px",
    marginTop: "4px",
  },
};
