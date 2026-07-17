'use client'

import { useEffect, useState } from 'react'
import { BUSINESS_EMAIL } from '@/lib/config'
import { C } from '@/lib/clientTheme'
import { calcDiscountAmount, type QuoteDiscount } from '@/lib/salesTax'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function extractDriveId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/)
  return match ? match[1] : null
}

function DriveThumb({ url }: { url: string }) {
  const fileId = extractDriveId(url)
  if (!fileId) return null
  const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl}
      alt="Design preview"
      style={{ maxWidth: '100%', maxHeight: '440px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

interface IntakeFile {
  id: string
  name: string
  size: number
  mime_type: string
  category: string
  signed_url: string | null
}

interface IntakeSummary {
  contact_title: string
  contact_method: string
  company_description: string
  quantity: string
  target_date: string
  project_timeline: string
  budget: string
  apparel_types: string
  audience: string
  station_code: string
  meaning: string
  style: string
  colors: string
  notes: string
  submitted_at: string
  files: IntakeFile[]
}

interface ClientUpdate {
  id: string
  date: string
  text: string
}

interface DesignVersion {
  name?: string
  file_url?: string
  drive_url?: string
  image_path?: string
  image_signed_url?: string | null
  status?: string
  notes?: string
  version_number?: number
  is_final?: boolean
}

interface LineItem {
  name: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
  originalUnitPrice?: number
}

interface PortalData {
  orderId: string
  clientName: string
  orderName: string
  collectionName: string
  status: string
  currentPhase: string
  estimatedDelivery: string
  quantity: string | number
  items: string
  invoiceTotal: string | number
  subtotal?: number | null
  discount?: QuoteDiscount | null
  salesTaxRate?: number | null
  salesTaxAmount?: number | null
  grandTotal?: number | null
  depositAmount: string | number
  depositPaid: boolean
  finalPaid: boolean
  balanceDue: number
  paymentStatus: string
  stripeInvoiceUrl: string
  designVersions: DesignVersion[]
  clientNotes: string
  intakeSummary: IntakeSummary | null
  lastUpdated: string
  clientUpdates: ClientUpdate[]
  lineItems: LineItem[]
}

const PHASES = ['Production', 'Quality Check', 'Ready', 'Delivered']

const CSS = `
  .po-outer {
    max-width: 780px;
    margin: 0 auto;
    padding: 48px 20px 80px;
    box-sizing: border-box;
  }
  .po-top-grid { display: block; }
  .po-right { margin-top: 48px; }
  .po-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 26px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    margin-bottom: 44px;
  }
  .po-stat-row {
    display: flex;
    gap: 12px;
    margin-top: 28px;
    flex-wrap: wrap;
  }
  .po-stat-row > div { flex: 1; min-width: 140px; }
  .po-timeline {
    display: flex;
    align-items: flex-start;
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .po-bottom-grid {
    display: flex;
    flex-direction: column;
    gap: 24px;
    margin-top: 48px;
  }
  .po-questions-row {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
    max-width: 100%;
    box-sizing: border-box;
  }
  .po-questions-copy {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
    max-width: 100%;
  }
  .po-questions-row > a {
    max-width: 100%;
    box-sizing: border-box;
  }
  .po-headline {
    font-size: 48px;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
    text-transform: uppercase;
    color: #181818;
    margin-bottom: 10px;
    margin-top: 4px;
  }
  .po-design-footer {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 24px;
    border-top: 1px solid rgba(0,0,0,0.08);
  }
  .po-brief-group { display: flex; flex-direction: column; gap: 5px; }
  .po-brief-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.24em;
    color: #8b8f88;
    text-transform: uppercase;
  }
  @media (min-width: 640px) {
    .po-brief-group {
      display: grid;
      grid-template-columns: 180px 1fr;
      column-gap: 28px;
      align-items: start;
    }
    .po-brief-label { padding-top: 4px; }
    .po-design-footer {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }
  @media (max-width: 639px) {
    .po-header { flex-direction: column; }
    .po-header a { width: 100%; text-align: center; box-sizing: border-box; }
    .po-questions-copy { align-items: flex-start; }
    .po-questions-row > a { width: 100%; text-align: center; }
    .po-headline { font-size: 40px; }
  }
  @media (min-width: 1024px) {
    .po-outer { max-width: 1540px; padding: 64px 80px 100px; }
    .po-top-grid {
      display: grid;
      grid-template-columns: minmax(0, 44fr) minmax(0, 56fr);
      gap: 56px;
      align-items: start;
    }
    .po-right { margin-top: 0; }
    .po-bottom-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 24px;
    }
    .po-questions-row {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
    }
    .po-headline { font-size: 48px; }
    .po-brief-group {
      grid-template-columns: 200px 1fr;
      column-gap: 32px;
    }
  }
`

export default function PortalPage() {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    const t = window.location.pathname.split('/').pop() || ''
    if (!t) return
    fetch(`/api/portal/${t}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('Failed to load portal'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={s.page}>
      <style>{CSS}</style>
      <div className="po-outer">
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.rule} />
        <div style={s.mutedText}>Loading your order portal...</div>
      </div>
    </div>
  )

  if (error || !data) return (
    <div style={s.page}>
      <style>{CSS}</style>
      <div className="po-outer">
        <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
        <div style={s.tagline}>Made by three, worn by all.</div>
        <div style={s.rule} />
        <div style={s.eyebrow}>ERROR</div>
        <div className="po-headline">PORTAL NOT FOUND</div>
        <div style={s.bodyText}>This link may be invalid or expired. Contact your Threefold representative.</div>
      </div>
    </div>
  )

  const currentPhaseIndex = PHASES.findIndex(p =>
    p.toLowerCase() === (data.currentPhase || data.status || '').toLowerCase()
  )
  const fileUrl = (v: DesignVersion) => v.drive_url || v.file_url || ''
  const fmtCurrency = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const totalVal = Number(data.grandTotal ?? data.invoiceTotal) || 0
  const hasTax = (data.salesTaxAmount ?? 0) > 0
  const depositVal = Number(data.depositAmount) || 0
  const balanceVal = Number(data.balanceDue) || 0
  const depositIsPaid = data.depositPaid === true
  const isPaidInFull = data.finalPaid === true
  const hasPayment = totalVal > 0
  const hasLineItems = (data.lineItems?.length ?? 0) > 0

  // Discount display (inherited from the quote/deposit; subtotal stays pre-discount).
  const discount = data.discount ?? null
  const discountAmount = discount ? calcDiscountAmount(data.subtotal ?? 0, discount) : 0
  const hasDiscount = discount != null && discountAmount > 0
  const hasSubtotal = (data.subtotal ?? 0) > 0
  const discountLabel = discount
    ? discount.type === 'percent'
      ? `${discount.label} (-${discount.value}%)`
      : discount.label
    : ''

  return (
    <div style={s.page}>
      <style>{CSS}</style>

      <div className="po-outer">

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="po-header">
          <div>
            <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
            <div style={s.tagline}>Made by three, worn by all.</div>
          </div>
          <a href={`mailto:${BUSINESS_EMAIL}`} style={{ ...s.btnOutline, marginTop: 0 }}>
            CONTACT THREEFOLD
          </a>
        </div>

        {/* ── TOP TWO-COLUMN GRID ────────────────────────────────── */}
        <div className="po-top-grid">

          {/* LEFT COLUMN */}
          <div className="po-left">
            <div style={s.eyebrow}>CLIENT PORTAL</div>
            <div className="po-headline">
              {data.orderName || data.collectionName || data.clientName || 'Your Order'}
            </div>
            {data.orderId && (
              <div style={s.subheadline}>
                {data.orderId}
              </div>
            )}

            {/* Status + Last Updated cards */}
            <div className="po-stat-row">
              {data.status && (
                <div style={s.statCard}>
                  <div style={s.statCardLabel}>STATUS</div>
                  <div style={s.statCardValue}>{data.status.toUpperCase()}</div>
                </div>
              )}
              {data.lastUpdated && (
                <div style={s.statCard}>
                  <div style={s.statCardLabel}>LAST UPDATED</div>
                  <div style={s.statCardValue}>
                    {new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              )}
            </div>

            {/* Current Status pill */}
            <div style={{ marginTop: '28px' }}>
              <div style={s.statCardLabel}>CURRENT STATUS</div>
              <div style={{ marginTop: '10px' }}>
                <span style={s.badge}>
                  <span style={s.badgeDot} />
                  {(data.currentPhase || data.status || 'IN PROGRESS').toUpperCase()}
                </span>
              </div>
              {data.estimatedDelivery && (
                <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '8px', letterSpacing: '0.04em' }}>
                  Est. Delivery: {data.estimatedDelivery}
                </div>
              )}
            </div>

            {/* Horizontal timeline stepper */}
            <div style={{ marginTop: '40px' }}>
              <div style={s.eyebrow}>ORDER TIMELINE</div>
              <div className="po-timeline">
                {PHASES.map((phase, i) => {
                  const done = i < currentPhaseIndex
                  const current = i === currentPhaseIndex
                  const isLast = i === PHASES.length - 1
                  const nodeColor = current ? C.green : done ? C.green : '#d9dbd5'
                  const nodeBg = current ? C.green : done ? C.greenSoft : '#ffffff'
                  const labelColor = current ? C.textPrimary : done ? C.textMuted : C.textMuted
                  const inactiveLabel = '#8b8f88'
                  const lineColor = done ? C.green : '#d9dbd5'
                  return (
                    <div key={phase} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        {/* Left connector */}
                        <div style={{ flex: 1, height: '2px', background: i === 0 ? 'transparent' : lineColor }} />
                        {/* Node circle */}
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          border: `2px solid ${nodeColor}`,
                          background: nodeBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: current ? '#ffffff' : done ? C.greenText : C.textMuted, letterSpacing: '0.02em' }}>
                            {i + 1}
                          </span>
                        </div>
                        {/* Right connector */}
                        <div style={{ flex: 1, height: '2px', background: isLast ? 'transparent' : (done ? C.green : '#d9dbd5') }} />
                      </div>
                      <div style={{
                        fontSize: '10px', fontWeight: current ? 700 : 400,
                        letterSpacing: '0.08em', color: current || done ? labelColor : inactiveLabel,
                        textAlign: 'center', marginTop: '10px',
                        textTransform: 'uppercase', lineHeight: 1.4, padding: '0 2px',
                      }}>
                        {phase}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Client updates */}
            {data.clientUpdates?.length > 0 && (
              <div style={{ marginTop: '48px' }}>
                <div style={s.eyebrow}>UPDATES</div>
                {[...data.clientUpdates].sort((a, b) => b.date.localeCompare(a.date)).map((u) => (
                  <div key={u.id} style={s.updateRow}>
                    <div style={s.updateDate}>
                      {new Date(u.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={s.updateText}>{u.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN — design preview */}
          <div className="po-right">
            {data.designVersions?.length > 0 && (
              <>
                <div style={s.eyebrow}>APPROVED DESIGNS</div>
                {data.designVersions.map((v, i) => {
                  const url = fileUrl(v)
                  return (
                    <div key={i} style={s.bigDesignCard}>
                      {/* Image area */}
                      <div style={s.bigDesignImageArea}>
                        {v.image_signed_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.image_signed_url}
                            alt={`Design: ${v.name || `Version ${v.version_number || i + 1}`}`}
                            style={{ maxWidth: '100%', maxHeight: '440px', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                          />
                        ) : url ? (
                          <DriveThumb url={url} />
                        ) : (
                          <div style={{ color: C.textMuted, fontSize: '12px', letterSpacing: '0.1em', textAlign: 'center' }}>
                            NO PREVIEW AVAILABLE
                          </div>
                        )}
                      </div>
                      {/* Footer */}
                      <div className="po-design-footer">
                        <div>
                          {v.is_final && (
                            <div style={s.finalBadge}>FINAL DESIGN</div>
                          )}
                          <div style={s.bigDesignName}>
                            {(v.name || `Version ${v.version_number || i + 1}`).toUpperCase()}
                          </div>
                          {v.status && (
                            <div style={s.bigDesignStatus}>{v.status.toUpperCase()}</div>
                          )}
                          {v.notes && (
                            <div style={s.bigDesignNotes}>{v.notes}</div>
                          )}
                        </div>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" style={s.viewFullLink}>
                            VIEW FULL DESIGN →
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {data.clientNotes && (
              <div style={{ marginTop: data.designVersions?.length ? '28px' : '0' }}>
                <div style={s.eyebrow}>NOTES FROM THREEFOLD</div>
                <div style={s.notesBlock}>{data.clientNotes}</div>
              </div>
            )}
          </div>

        </div>
        {/* ── END TOP GRID ─────────────────────────────────────────── */}

        {/* ── BOTTOM DASHBOARD CARDS ─────────────────────────────── */}
        {(hasPayment || hasLineItems) && (
          <div className="po-bottom-grid">

            {/* Payment Summary card */}
            {hasPayment && (
              <div style={s.dashCard}>
                <div style={s.cardEyebrow}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
                  </svg>
                  PAYMENT SUMMARY
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={s.cardRow}>
                    <span style={{ ...s.cardRowLabel, fontWeight: 700 }}>TOTAL PROJECT VALUE</span>
                    <span style={s.cardRowValue}>{fmtCurrency(totalVal)}</span>
                  </div>
                  <div style={s.cardRow}>
                    <span style={s.cardRowLabel}>AMOUNT PAID</span>
                    <span style={{ ...s.cardRowValue, color: depositIsPaid ? C.green : undefined }}>
                      {depositVal > 0 ? fmtCurrency(depositVal) : '—'}
                      {depositIsPaid && <span style={{ fontSize: '13px', marginLeft: '6px' }}>✓</span>}
                    </span>
                  </div>
                  <div style={{ ...s.cardRow, borderBottom: hasTax ? undefined : 'none', paddingBottom: hasTax ? undefined : '4px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={s.cardRowLabel}>REMAINING BALANCE</div>
                      {!isPaidInFull && (
                        <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '5px', lineHeight: 1.5, maxWidth: '220px' }}>
                          Final payment is due once your order is complete and ready for delivery.
                        </div>
                      )}
                    </div>
                    <span style={{ ...s.cardRowValue, flexShrink: 0, marginLeft: '16px', color: isPaidInFull ? C.green : undefined }}>
                      {isPaidInFull ? 'PAID IN FULL ✓' : fmtCurrency(balanceVal)}
                    </span>
                  </div>
                  {(hasTax || hasDiscount) && (
                    <>
                      <button
                        onClick={() => setShowBreakdown((v) => !v)}
                        style={s.breakdownToggle}
                      >
                        {showBreakdown ? '▾' : '▸'} VIEW FULL PRICING BREAKDOWN
                      </button>
                      {showBreakdown && (
                        <div style={s.breakdownExpanded}>
                          {hasSubtotal && (
                            <div style={s.cardRow}>
                              <span style={s.cardRowLabel}>SUBTOTAL</span>
                              <span style={{ ...s.cardRowValue, fontSize: '16px' }}>{fmtCurrency(data.subtotal ?? 0)}</span>
                            </div>
                          )}
                          {hasDiscount && (
                            <div style={s.cardRow}>
                              <span style={s.cardRowLabel}>{discountLabel}</span>
                              <span style={{ ...s.cardRowValue, fontSize: '16px', color: C.textMuted }}>-{fmtCurrency(discountAmount)}</span>
                            </div>
                          )}
                          {hasTax && (
                            <div style={s.cardRow}>
                              <span style={s.cardRowLabel}>SALES TAX ({data.salesTaxRate != null ? `${Math.round(data.salesTaxRate * 10000) / 100}%` : '9.375%'})</span>
                              <span style={{ ...s.cardRowValue, fontSize: '16px', color: C.textSecondary }}>{fmtCurrency(data.salesTaxAmount ?? 0)}</span>
                            </div>
                          )}
                          <div style={{ ...s.cardRow, borderBottom: 'none', paddingBottom: '4px' }}>
                            <span style={{ ...s.cardRowLabel, fontWeight: 700 }}>TOTAL</span>
                            <span style={s.cardRowValue}>{fmtCurrency(totalVal)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {data.stripeInvoiceUrl && (
                  <a href={data.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer" style={s.btnGold}>
                    VIEW INVOICE →
                  </a>
                )}
              </div>
            )}

            {/* Order Breakdown card */}
            {hasLineItems && (
              <div style={s.dashCard}>
                <div style={s.cardEyebrow}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                  </svg>
                  ORDER BREAKDOWN
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {data.lineItems.map((li, i) => (
                    <div key={i} style={s.cardRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.cardRowLabel}>{li.name.toUpperCase()}</div>
                        {li.description && (
                          <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>{li.description}</div>
                        )}
                        <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>
                          {li.quantity} ×{' '}
                          {li.originalUnitPrice != null && li.originalUnitPrice > li.unitPrice ? (
                            <>
                              <span style={{ textDecoration: 'line-through', marginRight: '6px' }}>
                                {fmtCurrency(li.originalUnitPrice)}
                              </span>
                              {fmtCurrency(li.unitPrice)}
                            </>
                          ) : (
                            fmtCurrency(li.unitPrice)
                          )}
                        </div>
                        {li.originalUnitPrice != null && li.originalUnitPrice > li.unitPrice && (
                          <div style={{ fontSize: '10px', color: C.textMuted, fontStyle: 'italic', letterSpacing: '0.04em', marginTop: '3px' }}>
                            *Custom pricing applied
                          </div>
                        )}
                      </div>
                      <span style={{ ...s.cardRowValue, flexShrink: 0, marginLeft: '16px' }}>
                        {fmtCurrency(li.lineTotal)}
                      </span>
                    </div>
                  ))}
                  {hasDiscount && (
                    <div style={s.cardRow}>
                      <span style={{ ...s.cardRowLabel, color: C.textSecondary }}>{discountLabel}</span>
                      <span style={{ ...s.cardRowValue, fontSize: '16px', color: C.textMuted }}>-{fmtCurrency(discountAmount)}</span>
                    </div>
                  )}
                  {hasTax && (
                    <>
                      <div style={s.cardRow}>
                        <span style={{ ...s.cardRowLabel, color: C.textSecondary }}>SALES TAX</span>
                        <span style={{ ...s.cardRowValue, fontSize: '16px', color: C.textSecondary }}>{fmtCurrency(data.salesTaxAmount ?? 0)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ ...s.cardRow, borderBottom: 'none', paddingBottom: '4px' }}>
                    <span style={{ ...s.cardRowLabel, color: C.textSecondary, fontWeight: 700 }}>ORDER TOTAL</span>
                    <span style={{ ...s.cardRowValue, color: C.gold, fontSize: '22px' }}>
                      {fmtCurrency(totalVal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div style={s.questionsCard}>
              <div className="po-questions-row">
                <div className="po-questions-copy">
                  <div style={s.questionsIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={s.questionsHeading}>QUESTIONS?</div>
                    <div style={s.questionsText}>Reach out to your Threefold representative directly.</div>
                  </div>
                </div>
                <a href={`mailto:${BUSINESS_EMAIL}`} style={s.btnOutline}>CONTACT THREEFOLD →</a>
              </div>
            </div>

          </div>
        )}

        {/* ── QUESTIONS CARD ─────────────────────────────────────── */}
        {!(hasPayment || hasLineItems) && (
        <div style={{ marginTop: '24px' }}>
          <div style={s.questionsCard}>
            <div className="po-questions-row">
              <div className="po-questions-copy">
                <div style={s.questionsIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                  </svg>
                </div>
                <div>
                  <div style={s.questionsHeading}>QUESTIONS?</div>
                  <div style={s.questionsText}>Reach out to your Threefold representative directly.</div>
                </div>
              </div>
              <a href={`mailto:${BUSINESS_EMAIL}`} style={s.btnOutline}>CONTACT THREEFOLD →</a>
            </div>
          </div>
        </div>
        )}

        {/* ── INTAKE / BRIEF SUMMARY ─────────────────────────────── */}
        {(() => {
          const snap = data.intakeSummary
          if (!snap) return null
          const orderFields: [string, string][] = [
            ['APPAREL TYPE', snap.apparel_types],
            ['QUANTITY', snap.quantity],
            ['Project timeline', snap.project_timeline || snap.target_date],
            ['BUDGET RANGE', snap.budget],
            ['WHO IS IT FOR', snap.audience],
            ['STATION CODE', snap.station_code],
          ].filter(([, v]) => !!v) as [string, string][]
          const designFields: [string, string][] = [
            ['WHAT IT SHOULD REPRESENT', snap.meaning],
            ['STYLE DIRECTION', snap.style],
            ['COLOR PREFERENCES', snap.colors],
          ].filter(([, v]) => !!v) as [string, string][]
          const hasContent = snap.company_description || orderFields.length > 0 || designFields.length > 0 || snap.notes || snap.files.length > 0
          if (!hasContent) return null
          return (
            <>
              <div style={s.rule} />
              <div style={{ marginBottom: '4px' }}>
                <div style={s.eyebrow}>YOUR SUBMITTED BRIEF</div>
                {snap.submitted_at && (
                  <div style={{ fontSize: '12px', color: C.textMuted, letterSpacing: '0.06em', marginBottom: '32px' }}>
                    Submitted {new Date(snap.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
                {snap.company_description && (
                  <div style={{ marginBottom: '36px' }}>
                    <div style={s.intakeSubLabel}>COMPANY OVERVIEW</div>
                    <div style={{ fontSize: '15px', color: C.textSecondary, lineHeight: 1.75 }}>{snap.company_description}</div>
                  </div>
                )}
                {orderFields.length > 0 && (
                  <div style={{ marginBottom: '36px' }}>
                    <div style={s.intakeSubLabel}>ORDER NEEDS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {orderFields.map(([k, v]) => (
                        <div key={k} className="po-brief-group">
                          <div className="po-brief-label">{k}</div>
                          <div style={{ fontSize: '15px', fontWeight: 500, color: C.textSecondary, lineHeight: 1.65 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {designFields.length > 0 && (
                  <div style={{ marginBottom: '36px' }}>
                    <div style={s.intakeSubLabel}>DESIGN DIRECTION</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {designFields.map(([k, v]) => (
                        <div key={k} className="po-brief-group">
                          <div className="po-brief-label">{k}</div>
                          <div style={{ fontSize: '15px', fontWeight: 500, color: C.textSecondary, lineHeight: 1.65 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {snap.notes && (
                  <div style={{ marginBottom: '36px' }}>
                    <div style={s.intakeSubLabel}>NOTES &amp; INSPIRATION</div>
                    <div style={s.notesBlock}>{snap.notes}</div>
                  </div>
                )}
                {snap.files.length > 0 && (
                  <div style={{ marginBottom: '36px' }}>
                    <div style={s.intakeSubLabel}>SUBMITTED FILES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {snap.files.map(f => (
                        <div key={f.id} style={s.intakeFileRow}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: C.textPrimary, letterSpacing: '0.02em', marginBottom: '2px' }}>{f.name}</div>
                            <div style={{ fontSize: '10px', color: C.textMuted, letterSpacing: '0.12em' }}>{f.category.toUpperCase()} · {fmtBytes(f.size)}</div>
                          </div>
                          {f.signed_url ? (
                            <a href={f.signed_url} target="_blank" rel="noreferrer" style={s.viewFullLink}>VIEW →</a>
                          ) : (
                            <span style={{ fontSize: '10px', color: C.textMuted, letterSpacing: '0.12em', flexShrink: 0 }}>Unavailable</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        })()}

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  // ── Page shell ────────────────────────────────────────────────────────────
  page: { backgroundColor: C.bg, minHeight: '100vh', fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif', color: C.textPrimary },

  // ── Header ────────────────────────────────────────────────────────────────
  logo: { fontSize: '19px', fontWeight: 800, letterSpacing: '0.06em', color: C.textPrimary, marginBottom: '6px' },
  tagline: { fontSize: '13px', letterSpacing: '0', color: C.textSecondary },
  rule: { height: '1px', backgroundColor: C.border, margin: '40px 0' },

  // ── Typography ────────────────────────────────────────────────────────────
  eyebrow: { fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', color: C.textSecondary, marginBottom: '16px', textTransform: 'uppercase' },
  subheadline: { fontSize: '15px', fontWeight: 600, color: C.textSecondary, letterSpacing: '0', marginTop: '12px' },
  bodyText: { fontSize: '15px', color: C.textSecondary, lineHeight: 1.75, marginBottom: '4px' },
  notesBlock: { fontSize: '15px', color: C.textSecondary, lineHeight: 1.75, borderLeft: `2px solid ${C.green}`, paddingLeft: '16px' },
  mutedText: { fontSize: '13px', color: C.textMuted, letterSpacing: '0.05em', marginTop: '16px' },

  // ── Status cards row ──────────────────────────────────────────────────────
  statCard: {
    background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px 22px', boxShadow: C.shadow,
  },
  statCardLabel: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', color: C.textMuted, textTransform: 'uppercase', marginBottom: '8px' },
  statCardValue: { fontSize: '18px', fontWeight: 700, color: C.textPrimary },

  // ── Current status badge ──────────────────────────────────────────────────
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    background: C.greenSoft, color: C.greenText,
    fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em',
    padding: '10px 20px', borderRadius: '999px',
  },
  badgeDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: C.green, flexShrink: 0,
  },

  // ── Client updates ────────────────────────────────────────────────────────
  updateRow: { marginBottom: '20px' },
  updateDate: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', color: C.textMuted, marginBottom: '4px' },
  updateText: { fontSize: '15px', color: C.textSecondary, lineHeight: 1.7 },

  // ── Design card ───────────────────────────────────────────────────────────
  bigDesignCard: {
    background: C.bgElevated, border: `1px solid ${C.border}`, borderRadius: '10px',
    overflow: 'hidden', marginBottom: '20px', boxShadow: C.shadow,
  },
  bigDesignImageArea: {
    background: C.bgSubtle, padding: '36px 28px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '320px',
  },
  bigDesignName: { fontSize: '17px', fontWeight: 800, letterSpacing: '0', color: C.textPrimary, marginBottom: '5px' },
  bigDesignStatus: { fontSize: '13px', letterSpacing: '0', color: C.textSecondary, marginBottom: '6px' },
  bigDesignNotes: { fontSize: '13px', color: C.textSecondary, lineHeight: 1.6, marginTop: '6px' },
  finalBadge: {
    display: 'inline-block', background: C.greenSoft, color: C.greenText,
    fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
    padding: '3px 10px', borderRadius: '99px', marginBottom: '8px',
  },
  viewFullLink: {
    fontSize: '13px', fontWeight: 800, letterSpacing: '0', color: C.greenText,
    textDecoration: 'none', borderBottom: `1px solid ${C.greenBorder}`, paddingBottom: '2px',
    whiteSpace: 'nowrap', flexShrink: 0,
  },

  // ── Dashboard cards (bottom grid) ─────────────────────────────────────────
  dashCard: {
    background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '10px',
    padding: '28px 32px', boxShadow: C.shadow,
  },
  cardEyebrow: {
    fontSize: '12px', fontWeight: 800, letterSpacing: '0.12em', color: C.textPrimary,
    textTransform: 'uppercase', marginBottom: '4px',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  cardRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    borderBottom: `1px solid ${C.border}`, padding: '16px 0',
  },
  cardRowLabel: { fontSize: '12px', fontWeight: 700, letterSpacing: '0.18em', color: C.textMuted, textTransform: 'uppercase' },
  cardRowValue: { fontSize: '18px', fontWeight: 700, color: C.textPrimary },

  // ── Buttons ───────────────────────────────────────────────────────────────
  btnGold: {
    display: 'inline-block', marginTop: '24px',
    backgroundColor: C.green, color: '#ffffff',
    fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em',
    padding: '15px 28px', textDecoration: 'none', borderRadius: '8px',
  },
  btnOutline: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1.5px solid ${C.greenBorder}`, color: C.greenText,
    fontSize: '12px', fontWeight: 800, letterSpacing: '0',
    padding: '13px 24px', textDecoration: 'none', borderRadius: '999px',
    flexShrink: 1, whiteSpace: 'normal',
    maxWidth: '100%', boxSizing: 'border-box', textAlign: 'center',
  },

  // ── Questions card ─────────────────────────────────────────────────────────
  questionsCard: {
    background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: '10px',
    padding: '34px 32px', boxShadow: C.shadow,
    maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden',
  },
  questionsIcon: {
    width: '48px', height: '48px', borderRadius: '50%',
    background: C.bgSubtle, border: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: C.textPrimary, flexShrink: 0,
  },
  questionsHeading: {
    fontSize: '18px', fontWeight: 800, letterSpacing: '0.12em',
    color: C.textPrimary, textTransform: 'uppercase', marginBottom: '6px',
  },
  questionsText: { fontSize: '14px', color: C.textSecondary, lineHeight: 1.6 },

  // ── Intake / brief ────────────────────────────────────────────────────────
  intakeSubLabel: { fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', color: C.textPrimary, marginBottom: '16px', textTransform: 'uppercase' },
  intakeFileRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
    border: `1px solid ${C.border}`, padding: '12px 16px', backgroundColor: C.bgCard, borderRadius: '6px',
  },
  breakdownToggle: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: C.textMuted,
    textTransform: 'uppercase' as const,
    padding: '14px 0 4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    textAlign: 'left' as const,
  },
  breakdownExpanded: {
    borderTop: `1px solid ${C.border}`,
    marginTop: '4px',
    paddingTop: '4px',
  },
}
