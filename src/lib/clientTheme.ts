import type { CSSProperties } from 'react'

// ─── Color tokens ──────────────────────────────────────────────────────────
export const C = {
  bg:            '#f7f7f5',
  bgCard:        '#ffffff',
  bgElevated:    '#ffffff',
  bgSubtle:      '#f1f2ef',
  textPrimary:   '#181818',
  textSecondary: '#5f625d',
  textMuted:     '#8b8f88',
  gold:          '#5f9f7a',
  border:        'rgba(0,0,0,0.08)',
  borderGold:    'rgba(95,159,122,0.28)',
  green:         '#5f9f7a',
  greenSoft:     '#dff1e8',
  greenText:     '#3f7f5f',
  greenBorder:   'rgba(95,159,122,0.32)',
  amber:         '#5f625d',
  red:           '#b45353',
  shadow:        '0 10px 30px rgba(0,0,0,0.06)',
} as const

// ─── Shared base styles used across all four client-facing pages ───────────
export const dk: Record<string, CSSProperties> = {
  headerBlock: { marginBottom: '8px' },

  logo: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#181818',
    marginBottom: '4px',
  },
  tagline: {
    fontSize: '11px',
    letterSpacing: '0.08em',
    color: '#5f625d',
  },

  rule: {
    height: '1px',
    backgroundColor: 'rgba(0,0,0,0.08)',
    margin: '32px 0',
  },
  section: { marginBottom: '4px' },

  eyebrow: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    color: '#5f625d',
    marginBottom: '16px',
    textTransform: 'uppercase' as const,
  },
  headline: {
    fontSize: '48px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    color: '#181818',
    marginBottom: '10px',
  },

  summaryStrip: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    marginTop: '20px',
  },
  chip: {
    border: '1px solid rgba(0,0,0,0.08)',
    padding: '14px 20px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    minWidth: '120px',
  },
  chipLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    color: '#8b8f88',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
  },
  chipValue: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#181818',
  },

  // ─── Dashboard card system ─────────────────────────────────────────────
  dashCard: {
    background: '#ffffff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '12px',
    padding: '28px 32px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
  },
  cardEyebrow: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: '#181818',
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
    borderBottom: '1px solid rgba(0,0,0,0.08)',
    padding: '16px 0',
  },
  cardRowLabel: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: '#5f625d',
    textTransform: 'uppercase' as const,
  },
  cardRowValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#181818',
  },

  detailList: { display: 'flex', flexDirection: 'column' as const },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: '1px solid rgba(0,0,0,0.08)',
    padding: '14px 0',
  },
  detailKey: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.20em',
    color: '#5f625d',
    textTransform: 'uppercase' as const,
  },
  detailVal: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#181818',
  },

  bodyText: {
    fontSize: '15px',
    color: '#5f625d',
    lineHeight: 1.75,
    marginBottom: '12px',
  },
  notesBlock: {
    fontSize: '15px',
    color: '#5f625d',
    lineHeight: 1.75,
    borderLeft: '2px solid #5f9f7a',
    paddingLeft: '16px',
    marginTop: '12px',
  },
  mutedText: {
    fontSize: '13px',
    color: '#8b8f88',
    letterSpacing: '0.05em',
    marginTop: '16px',
  },

  btnGold: {
    display: 'inline-block',
    marginTop: '24px',
    backgroundColor: '#5f9f7a',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '15px 36px',
    textDecoration: 'none',
    borderRadius: '8px',
  },
  btnOutline: {
    display: 'inline-block',
    marginTop: '0',
    border: '1.5px solid rgba(95,159,122,0.45)',
    color: '#3f7f5f',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.22em',
    padding: '15px 36px',
    textDecoration: 'none',
    borderRadius: '8px',
    flexShrink: 0,
  },

  footerLogo: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: '#8b8f88',
    marginBottom: '4px',
  },
  footerTagline: {
    fontSize: '10px',
    color: '#8b8f88',
    letterSpacing: '0.06em',
  },

  // ─── Payment callout boxes ───────────────────────────────────────────────
  calloutPending: {
    marginTop: '20px',
    border: '1px solid rgba(95,159,122,0.28)',
    backgroundColor: '#dff1e8',
    padding: '20px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: '8px',
  },
  calloutPaid: {
    marginTop: '20px',
    border: '1px solid rgba(95,159,122,0.28)',
    backgroundColor: '#dff1e8',
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
    color: '#3f7f5f',
  },
  calloutAmountPending: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#3f7f5f',
    letterSpacing: '-0.01em',
  },
  calloutAmountPaid: {
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: '#3f7f5f',
  },
}
