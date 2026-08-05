import { C } from '@/lib/clientTheme'
import { normalizeSizes, sizesTotal, type SizeQty } from '@/lib/sizeBreakdown'

// Read-only Size / Qty breakdown table shown to the client on the portal + invoice.
// Renders nothing when there's no breakdown, so callers can drop it in unconditionally.
// The `print-keep` class ties into the invoice's @media print rules (break-inside: avoid).
export default function SizeTable({ sizes }: { sizes?: SizeQty[] | null }) {
  const rows = normalizeSizes(sizes)
  if (rows.length === 0) return null
  const total = sizesTotal(rows)

  const cell: React.CSSProperties = {
    padding: '5px 10px',
    fontSize: '12px',
    borderBottom: `1px solid ${C.border}`,
  }
  const headCell: React.CSSProperties = {
    ...cell,
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: C.textMuted,
    textTransform: 'uppercase',
  }

  return (
    <table
      className="print-keep"
      style={{
        marginTop: '10px',
        borderCollapse: 'collapse',
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
        maxWidth: '260px',
        width: '100%',
      }}
    >
      <thead>
        <tr style={{ background: C.greenSoft }}>
          <th style={{ ...headCell, textAlign: 'left', color: C.greenText }}>Size</th>
          <th style={{ ...headCell, textAlign: 'right', color: C.greenText }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...cell, color: C.textPrimary, fontWeight: 600 }}>{r.size}</td>
            <td style={{ ...cell, textAlign: 'right', color: C.textSecondary }}>{r.qty}</td>
          </tr>
        ))}
        <tr>
          <td style={{ ...cell, borderBottom: 'none', fontWeight: 700, color: C.textSecondary }}>Total</td>
          <td style={{ ...cell, borderBottom: 'none', textAlign: 'right', fontWeight: 700, color: C.textPrimary }}>{total}</td>
        </tr>
      </tbody>
    </table>
  )
}
