import type { CSSProperties } from 'react'

// ─── Color tokens ──────────────────────────────────────────────────────────
export const C = {
  bg:            '#1c1916',
  bgCard:        '#242017',
  bgElevated:    '#2e2922',
  textPrimary:   '#f5f1e8',
  textSecondary: '#c8c0b4',
  textMuted:     '#a09488',
  gold:          '#d4a326',
  border:        'rgba(255,255,255,0.09)',
  borderGold:    'rgba(212,163,38,0.28)',
  green:         '#4ece6a',
  greenBorder:   'rgba(78,206,106,0.24)',
  amber:         '#e09020',
  red:           '#f87171',
} as const

// ─── Shared base styles used across all four client-facing pages ───────────
export const dk: Record<string, CSSProperties> = {
  headerBlock: { marginBottom: '8px' },

  logo: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.26em',
    color: C.textPrimary,
    marginBottom: '4px',
  },
  tagline: {
    fontSize: '11px',
    letterSpacing: '0.08em',
    color: C.textMuted,
  },

  rule: {
    height: '1px',
    backgroundColor: C.border,
    margin: '40px 0',
  },
  section: { marginBottom: '4px' },

  eyebrow: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.30em',
    color: C.gold,
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
  },
  headline: {
    fontSize: '56px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    textTransform: 'uppercase' as const,
    color: C.textPrimary,
    marginBottom: '10px',
  },

  summaryStrip: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '10px',
    marginTop: '20px',
  },
  chip: {
    border: `1px solid ${C.border}`,
    padding: '10px 16px',
    backgroundColor: C.bgCard,
  },
  chipLabel: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.24em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  chipValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: C.textPrimary,
  },

  detailList: { display: 'flex', flexDirection: 'column' as const },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px solid ${C.border}`,
    padding: '13px 0',
  },
  detailKey: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.20em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
  },
  detailVal: {
    fontSize: '15px',
    fontWeight: 600,
    color: C.textPrimary,
  },

  bodyText: {
    fontSize: '15px',
    color: C.textSecondary,
    lineHeight: 1.75,
    marginBottom: '12px',
  },
  notesBlock: {
    fontSize: '14px',
    color: C.textSecondary,
    lineHeight: 1.75,
    borderLeft: `2px solid ${C.gold}`,
    paddingLeft: '16px',
    marginTop: '12px',
  },
  mutedText: {
    fontSize: '13px',
    color: C.textMuted,
    letterSpacing: '0.05em',
    marginTop: '16px',
  },

  btnGold: {
    display: 'inline-block',
    marginTop: '20px',
    backgroundColor: C.gold,
    color: '#0d0b08',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '14px 32px',
    textDecoration: 'none',
  },
  btnOutline: {
    display: 'inline-block',
    marginTop: '16px',
    border: `1.5px solid ${C.textMuted}`,
    color: C.textSecondary,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '14px 32px',
    textDecoration: 'none',
  },

  footerLogo: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: C.textMuted,
    marginBottom: '4px',
  },
  footerTagline: {
    fontSize: '10px',
    color: C.textMuted,
    letterSpacing: '0.06em',
  },

  // ─── Payment callout boxes ───────────────────────────────────────────────
  calloutPending: {
    marginTop: '16px',
    border: `1px solid ${C.borderGold}`,
    backgroundColor: 'rgba(212,163,38,0.07)',
    padding: '18px 22px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calloutPaid: {
    marginTop: '16px',
    border: `1px solid ${C.greenBorder}`,
    backgroundColor: 'rgba(78,206,106,0.07)',
    padding: '18px 22px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calloutLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    color: C.amber,
  },
  calloutAmountPending: {
    fontSize: '22px',
    fontWeight: 700,
    color: C.amber,
    letterSpacing: '-0.01em',
  },
  calloutAmountPaid: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: C.green,
  },
}
