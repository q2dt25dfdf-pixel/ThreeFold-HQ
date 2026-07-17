"use client";

import type { CSSProperties } from "react";
import { C } from "@/lib/clientTheme";

// All four client-facing cards use 32px horizontal padding. The discount band
// breaks out of that padding with negative margins, then re-applies it inside so
// the tinted band touches both card edges while its text stays aligned with the
// other rows.
const CARD_PAD = 32;

const bandContainer: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: "16px",
  marginLeft: `-${CARD_PAD}px`,
  marginRight: `-${CARD_PAD}px`,
  padding: `14px ${CARD_PAD}px`,
  backgroundColor: C.greenSoft,
  borderTop: `1px solid ${C.greenBorder}`,
  borderBottom: `1px solid ${C.greenBorder}`,
};

// STEP 1 — full-width green-tinted discount band. `labelStyle`/`valueStyle` are the
// page's own row-label/row-value styles so the band matches each page's typography;
// the band only re-colors them (deep green) and bumps the amount to weight 800.
export function DiscountBand({
  label,
  amount,
  labelStyle,
  valueStyle,
}: {
  label: string;
  amount: string;
  labelStyle: CSSProperties;
  valueStyle: CSSProperties;
}) {
  return (
    <div style={bandContainer}>
      <span style={{ ...labelStyle, color: C.greenText, minWidth: 0 }}>{label}</span>
      <span style={{ ...valueStyle, color: C.greenText, fontWeight: 800, flexShrink: 0 }}>
        -{amount}
      </span>
    </div>
  );
}

const savingsNoteBase: CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.greenText,
  opacity: 0.72,
  lineHeight: 1.4,
};

// STEP 2 — "{amount} SAVED WITH {LABEL}" sub-line that sits beneath the total inside
// the existing total box. Small, letter-spaced, reduced-opacity deep green.
export function SavingsNote({
  amount,
  label,
  style,
}: {
  amount: string;
  label: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ ...savingsNoteBase, ...style }}>
      {amount} SAVED WITH {label.toUpperCase()}
    </div>
  );
}

const saveChip: CSSProperties = {
  display: "inline-block",
  backgroundColor: C.greenSoft,
  color: C.greenText,
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "3px 8px",
  borderRadius: "99px",
  marginTop: "5px",
};

// STEP 3 — per-unit savings chip shown after an item's math line when it has a
// reduced unit price. Light-green tint (not solid green), deep-green text.
export function SaveChip({ perUnit }: { perUnit: number }) {
  return <span style={saveChip}>SAVE ${perUnit.toFixed(2)}/UNIT</span>;
}
