'use client'

import { useEffect, useState } from 'react'
import { BUSINESS_EMAIL } from '@/lib/config'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function extractDriveId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/)
  return match ? match[1] : null
}

function DriveEmbed({ url }: { url: string }) {
  const fileId = extractDriveId(url)
  if (!fileId) return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={s.viewLink}>VIEW DESIGN →</a>
  )
  const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
  const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`
  return (
    <div style={{ marginTop: '12px' }}>
      <img
        src={thumbUrl}
        alt="Design preview"
        style={{ width: '100%', borderRadius: '2px', marginBottom: '10px', border: '1px solid #E5DDD2' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <a href={embedUrl} target="_blank" rel="noopener noreferrer" style={s.viewLink}>VIEW FULL DESIGN →</a>
    </div>
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

interface DesignVersion {
  name?: string
  file_url?: string
  drive_url?: string
  status?: string
  notes?: string
  version_number?: number
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
  depositPaid: string | number
  balanceDue: string | number
  stripeInvoiceUrl: string
  designVersions: DesignVersion[]
  clientNotes: string
  intakeSummary: IntakeSummary | null
}

const PHASES = ['Production','Quality Check','Ready','Delivered']

export default function PortalPage() {
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    <div style={s.page}><div style={s.singleCol}>
      <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
      <div style={s.rule} />
      <div style={s.mutedText}>Loading your order portal...</div>
    </div></div>
  )

  if (error || !data) return (
    <div style={s.page}><div style={s.singleCol}>
      <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
      <div style={s.tagline}>Made by three, worn by all.</div>
      <div style={s.rule} />
      <div style={s.eyebrow}>ERROR</div>
      <div style={s.headline}>PORTAL NOT FOUND</div>
      <div style={s.bodyText}>This link may be invalid or expired. Contact your Threefold representative.</div>
    </div></div>
  )

  const currentPhaseIndex = PHASES.findIndex(p =>
    p.toLowerCase() === (data.currentPhase || data.status || '').toLowerCase()
  )
  const fileUrl = (v: DesignVersion) => v.drive_url || v.file_url || ''

  return (
    <div style={s.page}>
      <style>{`
        .p-outer { max-width: 680px; margin: 0 auto; padding: 64px 32px 96px; }
        .p-grid { display: block; }
        .p-footer-row { display: block; }
        .p-brief-group { display: flex; flex-direction: column; gap: 5px; }
        .p-brief-label { font-size: 9px; font-weight: 700; letter-spacing: 0.24em; color: #9B9084; text-transform: uppercase; }
        @media (min-width: 640px) {
          .p-brief-group { display: grid; grid-template-columns: 180px 1fr; column-gap: 28px; align-items: start; }
          .p-brief-label { padding-top: 4px; }
        }
        @media (min-width: 1024px) {
          .p-outer { max-width: 1200px; padding: 64px 64px 96px; }
          .p-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; }
          .p-footer-row { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; }
          .p-brief-group { grid-template-columns: 200px 1fr; column-gap: 32px; }
        }
      `}</style>

      <div className="p-outer">

        <div style={s.headerBlock}>
          <div style={s.logo}>THREEFOLD SUPPLY CO.</div>
          <div style={s.tagline}>Made by three, worn by all.</div>
        </div>

        <div style={s.rule} />

        <div className="p-grid">

          {/* LEFT — information column */}
          <div>

            <div style={s.section}>
              <div style={s.eyebrow}>ORDER PORTAL</div>
              <div style={s.headline}>{(data.clientName || 'Your Order').toUpperCase()}</div>
              <div style={s.subheadline}>{data.collectionName || data.orderName}</div>
            </div>

            <div style={s.rule} />

            <div style={s.section}>
              <div style={s.eyebrow}>CURRENT STATUS</div>
              <div style={s.statusRow}>
                <span style={s.badge}>{(data.currentPhase || data.status || 'IN PROGRESS').toUpperCase()}</span>
                {data.estimatedDelivery && <span style={s.deliveryText}>Est. Delivery — {data.estimatedDelivery}</span>}
              </div>
            </div>

            <div style={s.rule} />

            <div style={s.section}>
              <div style={s.eyebrow}>ORDER TIMELINE</div>
              <div style={s.timeline}>
                {PHASES.map((phase, i) => {
                  const done = i < currentPhaseIndex
                  const current = i === currentPhaseIndex
                  return (
                    <div key={phase} style={s.timelineRow}>
                      <span style={{ ...s.timelineNum, color: done || current ? '#C49A2B' : '#7F776B' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ ...s.timelineLabel, color: done ? '#756D62' : current ? '#0a0a0a' : '#8A8174', fontWeight: current ? 700 : 400, textDecoration: done ? 'line-through' : 'none' }}>
                        {phase.toUpperCase()}
                      </span>
                      <span style={s.timelineTick}>{done ? '✓' : current ? '←' : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={s.rule} />

            <div style={s.section}>
              <div style={s.eyebrow}>ORDER DETAILS</div>
              <div style={s.detailList}>
                {data.items && <div style={s.detailRow}><span style={s.detailKey}>ITEMS</span><span style={s.detailVal}>{data.items}</span></div>}
                {data.quantity && <div style={s.detailRow}><span style={s.detailKey}>QUANTITY</span><span style={s.detailVal}>{data.quantity}</span></div>}
                {data.invoiceTotal && <div style={s.detailRow}><span style={s.detailKey}>ORDER TOTAL</span><span style={s.detailVal}>${Number(data.invoiceTotal).toLocaleString()}</span></div>}
              </div>
            </div>

            {(data.depositPaid || data.balanceDue || data.stripeInvoiceUrl) && (<>
              <div style={s.rule} />
              <div style={s.section}>
                <div style={s.eyebrow}>PAYMENT</div>
                <div style={s.detailList}>
                  {data.depositPaid && <div style={s.detailRow}><span style={s.detailKey}>DEPOSIT PAID</span><span style={s.detailVal}>${Number(data.depositPaid).toLocaleString()}</span></div>}
                  {data.balanceDue && <div style={s.detailRow}><span style={s.detailKey}>BALANCE DUE</span><span style={s.detailVal}>${Number(data.balanceDue).toLocaleString()}</span></div>}
                </div>
                {data.stripeInvoiceUrl && <a href={data.stripeInvoiceUrl} target="_blank" rel="noopener noreferrer" style={s.btnGold}>PAY INVOICE →</a>}
              </div>
            </>)}

          </div>

          {/* RIGHT — visual column */}
          <div>

            {data.designVersions?.length > 0 && (
              <div style={s.section}>
                <div style={s.eyebrow}>APPROVED DESIGNS</div>
                {data.designVersions.map((v, i) => (
                  <div key={i} style={s.designCard}>
                    <div style={s.designName}>{v.name || `Version ${v.version_number || i + 1}`}</div>
                    {v.status && <div style={s.designStatusLabel}>{v.status.toUpperCase()}</div>}
                    {v.notes && <div style={s.designNotes}>{v.notes}</div>}
                    {fileUrl(v) && <DriveEmbed url={fileUrl(v)} />}
                  </div>
                ))}
              </div>
            )}

            {data.clientNotes && (<>
              <div style={s.rule} />
              <div style={s.section}>
                <div style={s.eyebrow}>NOTES FROM THREEFOLD</div>
                <div style={s.notesBlock}>{data.clientNotes}</div>
              </div>
            </>)}

          </div>

        </div>

        {/* Intake summary — only when snapshot data exists */}
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
              <div style={s.section}>
                <div style={s.eyebrow}>YOUR SUBMITTED BRIEF</div>

                {snap.submitted_at && (
                  <div style={s.intakeSubmittedDate}>
                    Submitted {new Date(snap.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                )}

                {snap.company_description && (
                  <div style={s.intakeBlock}>
                    <div style={s.intakeSubLabel}>COMPANY OVERVIEW</div>
                    <div style={s.intakeBody}>{snap.company_description}</div>
                  </div>
                )}

                {orderFields.length > 0 && (
                  <div style={s.intakeBlock}>
                    <div style={s.intakeSubLabel}>ORDER NEEDS</div>
                    <div style={s.briefFieldList}>
                      {orderFields.map(([k, v]) => (
                        <div key={k} className="p-brief-group">
                          <div className="p-brief-label">{k}</div>
                          <div style={s.briefFieldAnswer}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {designFields.length > 0 && (
                  <div style={s.intakeBlock}>
                    <div style={s.intakeSubLabel}>DESIGN DIRECTION</div>
                    <div style={s.briefFieldList}>
                      {designFields.map(([k, v]) => (
                        <div key={k} className="p-brief-group">
                          <div className="p-brief-label">{k}</div>
                          <div style={s.briefFieldAnswer}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {snap.notes && (
                  <div style={s.intakeBlock}>
                    <div style={s.intakeSubLabel}>NOTES &amp; INSPIRATION</div>
                    <div style={s.notesBlock}>{snap.notes}</div>
                  </div>
                )}

                {snap.files.length > 0 && (
                  <div style={s.intakeBlock}>
                    <div style={s.intakeSubLabel}>SUBMITTED FILES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {snap.files.map(f => (
                        <div key={f.id} style={s.intakeFileRow}>
                          <div style={{ minWidth: 0 }}>
                            <div style={s.intakeFileName}>{f.name}</div>
                            <div style={s.intakeFileMeta}>{f.category.toUpperCase()} · {fmtBytes(f.size)}</div>
                          </div>
                          {f.signed_url ? (
                            <a href={f.signed_url} target="_blank" rel="noreferrer" style={s.viewLink}>VIEW →</a>
                          ) : (
                            <span style={{ ...s.intakeFileMeta, flexShrink: 0 }}>Unavailable</span>
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

        {/* Footer row — branding + questions on left, empty right */}
        <div style={s.rule} />
        <div className="p-footer-row">
          <div>
            <div style={s.eyebrow}>QUESTIONS?</div>
            <div style={s.bodyText}>Reach out to your Threefold representative directly.</div>
            <a href={`mailto:${BUSINESS_EMAIL}`} style={s.btnOutline}>CONTACT THREEFOLD →</a>
          </div>
          <div />
        </div>

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { backgroundColor: '#F7F3EC', minHeight: '100vh', fontFamily: '"Inter","Helvetica Neue",Arial,sans-serif', color: '#0a0a0a' },
  singleCol: { maxWidth: '660px', margin: '0 auto', padding: '64px 32px 96px' },
  headerBlock: { marginBottom: '8px' },
  logo: { fontSize: '12px', fontWeight: 800, letterSpacing: '0.22em', color: '#0a0a0a', marginBottom: '4px' },
  tagline: { fontSize: '11px', letterSpacing: '0.08em', color: '#6F685D' },
  rule: { height: '1px', backgroundColor: '#DDD6CB', margin: '36px 0' },
  section: { marginBottom: '4px' },
  eyebrow: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.28em', color: '#C49A2B', marginBottom: '14px' },
  headline: { fontSize: '52px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1, textTransform: 'uppercase', marginBottom: '10px' },
  subheadline: { fontSize: '16px', fontWeight: 400, color: '#3F3A33', letterSpacing: '0.04em' },
  statusRow: { display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' },
  badge: { backgroundColor: '#C49A2B', color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', padding: '6px 16px' },
  deliveryText: { fontSize: '13px', color: '#3F3A33', letterSpacing: '0.04em' },
  timeline: { display: 'flex', flexDirection: 'column', gap: '14px' },
  timelineRow: { display: 'flex', alignItems: 'center', gap: '16px' },
  timelineNum: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', width: '26px', flexShrink: 0 },
  timelineLabel: { fontSize: '12px', letterSpacing: '0.18em', flex: 1 },
  timelineTick: { fontSize: '13px', color: '#C49A2B', width: '20px', textAlign: 'right' as const },
  detailList: { display: 'flex', flexDirection: 'column' },
  detailRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #E5DDD2', padding: '12px 0' },
  detailKey: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', color: '#6F685D' },
  detailVal: { fontSize: '14px', fontWeight: 600, color: '#0a0a0a' },
  btnGold: { display: 'inline-block', marginTop: '24px', backgroundColor: '#C49A2B', color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', padding: '14px 32px', textDecoration: 'none' },
  btnOutline: { display: 'inline-block', marginTop: '16px', border: '1.5px solid #0a0a0a', color: '#0a0a0a', fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', padding: '14px 32px', textDecoration: 'none' },
  designCard: { border: '1px solid #DDD6CB', padding: '20px', marginBottom: '12px', backgroundColor: '#FAF7F2' },
  designName: { fontSize: '13px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' },
  designStatusLabel: { fontSize: '10px', letterSpacing: '0.2em', color: '#C49A2B', marginBottom: '8px' },
  designNotes: { fontSize: '13px', color: '#3F3A33', lineHeight: 1.6, marginBottom: '12px' },
  viewLink: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', color: '#0a0a0a', textDecoration: 'none', borderBottom: '1px solid #0a0a0a', paddingBottom: '2px' },
  notesBlock: { fontSize: '14px', color: '#332E28', lineHeight: 1.75, borderLeft: '2px solid #C49A2B', paddingLeft: '16px' },
  bodyText: { fontSize: '13px', color: '#3F3A33', lineHeight: 1.7, marginBottom: '4px' },
  mutedText: { fontSize: '12px', color: '#6F685D', letterSpacing: '0.05em', marginTop: '16px' },
  footerLogo: { fontSize: '10px', fontWeight: 800, letterSpacing: '0.22em', color: '#756D62', marginBottom: '4px' },
  footerTagline: { fontSize: '10px', color: '#7F776B', letterSpacing: '0.06em' },
  intakeSubmittedDate: { fontSize: '11px', color: '#6F685D', letterSpacing: '0.06em', marginBottom: '32px' },
  intakeBlock: { marginBottom: '36px' },
  intakeSubLabel: { fontSize: '9px', fontWeight: 700, letterSpacing: '0.28em', color: '#C49A2B', marginBottom: '16px', textTransform: 'uppercase' as const },
  intakeBody: { fontSize: '15px', color: '#1A1714', lineHeight: 1.75 },
  intakeFileRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', border: '1px solid #DDD6CB', padding: '12px 16px', backgroundColor: '#FAF7F2' },
  intakeFileName: { fontSize: '13px', fontWeight: 600, color: '#0a0a0a', letterSpacing: '0.02em', marginBottom: '2px' },
  intakeFileMeta: { fontSize: '10px', color: '#6F685D', letterSpacing: '0.12em' },
  briefFieldList: { display: 'flex', flexDirection: 'column' as const, gap: '20px' },
  briefFieldGroup: { display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  briefFieldLabel: { fontSize: '9px', fontWeight: 700, letterSpacing: '0.24em', color: '#9B9084', textTransform: 'uppercase' as const },
  briefFieldAnswer: { fontSize: '15px', fontWeight: 500, color: '#1A1714', lineHeight: 1.65 },
}
