import type { CSSProperties } from 'react'

// ─── Color tokens ──────────────────────────────────────────────────────────
export const C = {
  bg:            '#1a1815',
  bgCard:        '#242118',
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
    color: '#f5f1e8',
    marginBottom: '4px',
  },
  tagline: {
    fontSize: '11px',
    letterSpacing: '0.08em',
    color: '#a09488',
  },

  rule: {
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.09)',
    margin: '40px 0',
  },
  section: { marginBottom: '4px' },

  eyebrow: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.30em',
    color: '#d4a326',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
  },
  headline: {
    fontSize: '52px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    textTransform: 'uppercase' as const,
    color: '#f5f1e8',
    marginBottom: '10px',
  },

  summaryStrip: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    marginTop: '20px',
  },
  chip: {
    border: '1px solid rgba(255,255,255,0.09)',
    padding: '14px 20px',
    backgroundColor: '#242118',
    borderRadius: '8px',
    minWidth: '120px',
  },
  chipLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    color: '#a09488',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
  },
  chipValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#f5f1e8',
  },

  // ─── Dashboard card system ─────────────────────────────────────────────
  dashCard: {
    background: '#242118',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '12px',
    padding: '28px 32px',
  },
  cardEyebrow: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.26em',
    color: '#d4a326',
    textTransform: 'uppercase' as const,
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  cardRowList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: '1px solid rgba(255,255,255,0.09)',
    padding: '16px 0',
  },
  cardRowLabel: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: '#a09488',
    textTransform: 'uppercase' as const,
  },
  cardRowValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#f5f1e8',
  },

  detailList: { display: 'flex', flexDirection: 'column' as const },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: '1px solid rgba(255,255,255,0.09)',
    padding: '14px 0',
  },
  detailKey: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.20em',
    color: '#a09488',
    textTransform: 'uppercase' as const,
  },
  detailVal: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#f5f1e8',
  },

  bodyText: {
    fontSize: '15px',
    color: '#c8c0b4',
    lineHeight: 1.75,
    marginBottom: '12px',
  },
  notesBlock: {
    fontSize: '15px',
    color: '#c8c0b4',
    lineHeight: 1.75,
    borderLeft: '2px solid #d4a326',
    paddingLeft: '16px',
    marginTop: '12px',
  },
  mutedText: {
    fontSize: '13px',
    color: '#a09488',
    letterSpacing: '0.05em',
    marginTop: '16px',
  },

  btnGold: {
    display: 'inline-block',
    marginTop: '24px',
    backgroundColor: '#d4a326',
    color: '#0d0b08',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '15px 36px',
    textDecoration: 'none',
    borderRadius: '4px',
  },
  btnOutline: {
    display: 'inline-block',
    marginTop: '0',
    border: '1.5px solid rgba(255,255,255,0.3)',
    color: '#c8c0b4',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '15px 36px',
    textDecoration: 'none',
    borderRadius: '4px',
    flexShrink: 0,
  },

  footerLogo: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: '#a09488',
    marginBottom: '4px',
  },
  footerTagline: {
    fontSize: '10px',
    color: '#a09488',
    letterSpacing: '0.06em',
  },

  // ─── Payment callout boxes ───────────────────────────────────────────────
  calloutPending: {
    marginTop: '20px',
    border: '1px solid rgba(212,163,38,0.28)',
    backgroundColor: 'rgba(212,163,38,0.07)',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: '8px',
  },
  calloutPaid: {
    marginTop: '20px',
    border: '1px solid rgba(78,206,106,0.24)',
    backgroundColor: 'rgba(78,206,106,0.07)',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: '8px',
  },
  calloutLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    color: '#e09020',
  },
  calloutAmountPending: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#e09020',
    letterSpacing: '-0.01em',
  },
  calloutAmountPaid: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: '#4ece6a',
  },
}
