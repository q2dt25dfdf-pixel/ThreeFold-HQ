import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSignedUrls, getDesignSignedUrls } from '@/lib/getSignedUrl'
import { normalizeDiscount, type QuoteDiscount } from '@/lib/salesTax'
import { normalizeSizes, type SizeQty } from '@/lib/sizeBreakdown'
import { fmtDeliveryDate } from '@/lib/estDelivery'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const db = getSupabaseAdmin()

  const { data: orders, error } = await db
    .from('orders')
    .select('id, data')
    .eq('data->>portal_token', token)
    .limit(1)

  if (error || !orders || orders.length === 0)
    return NextResponse.json({ error: 'Portal not found' }, { status: 404 })

  const order = orders[0]
  const d = order.data

  if (!d.portal_enabled)
    return NextResponse.json({ error: 'Portal is disabled' }, { status: 403 })

  const orderId = order.id

  // Look up the linked invoice by order_id only — no name matching
  const { data: invoiceRows } = await db
    .from('finances')
    .select('id, data')
    .eq('data->>order_id', orderId)
    .order('id', { ascending: false })
    .limit(1)
  const inv = invoiceRows?.[0]?.data as Record<string, unknown> | undefined

  // Look up deposit request by stored ID (order takes precedence over invoice)
  const depositRequestId =
    (d.deposit_request_id as string | undefined) ||
    (inv?.deposit_request_id as string | undefined) ||
    null

  let depData: Record<string, unknown> | undefined
  if (depositRequestId) {
    const { data: depRows } = await db
      .from('deposit_requests')
      .select('data')
      .eq('id', depositRequestId)
      .limit(1)
    depData = depRows?.[0]?.data as Record<string, unknown> | undefined
  }

  // Authoritative amounts — deposit_request first, then invoice, then order.amount
  const totalAmount = Number(depData?.total_amount ?? inv?.total_amount ?? d.amount ?? 0)
  const depositAmountVal = Number(depData?.deposit_amount ?? inv?.deposit_amount ?? 0)
  const subtotalVal = Number(depData?.subtotal ?? inv?.subtotal ?? 0) || null
  const salesTaxAmountVal = Number(depData?.sales_tax_amount ?? inv?.sales_tax_amount ?? 0) || null
  const salesTaxRateVal = depData?.sales_tax_rate != null ? Number(depData.sales_tax_rate)
    : inv?.sales_tax_rate != null ? Number(inv.sales_tax_rate) : null
  const grandTotalVal = Number(depData?.grand_total ?? inv?.grand_total ?? 0) || null
  // Discount inherited from the deposit request / finance record (falls back to the
  // related quote below when line items are pulled from there).
  let discountVal: QuoteDiscount | null = normalizeDiscount(depData?.discount ?? inv?.discount ?? null)

  // Payment status from the finance record (updated by Stripe webhook or manual marking)
  const depositIsPaid = inv?.deposit_paid === true || inv?.deposit_paid === 'true'
  const finalIsPaid = inv?.final_paid === true || inv?.final_paid === 'true'

  // Balance remaining: 0 only when final invoice is actually paid
  const balanceDue = finalIsPaid
    ? 0
    : depositIsPaid && totalAmount > 0
    ? Math.max(totalAmount - depositAmountVal, 0)
    : totalAmount

  const paymentStatus = finalIsPaid
    ? 'Paid in Full'
    : depositIsPaid
    ? 'Deposit Paid'
    : 'Awaiting Deposit'

  // Collect image_path values from visible design versions to batch-sign in one call
  type RawDesignVersion = Record<string, unknown>
  const visibleDesignVersions: RawDesignVersion[] = (d.design_versions || [])
    .filter((v: RawDesignVersion) => {
      if (v.archived === true) return false;
      if (v.show_in_portal !== undefined) return v.show_in_portal === true;
      return v.visible_to_client !== false;
    })

  const designImagePaths = visibleDesignVersions
    .map((v) => (typeof v.image_path === 'string' && v.image_path ? v.image_path : null))
    .filter((p): p is string => p !== null)

  const designImageUrls = designImagePaths.length > 0
    ? await getDesignSignedUrls(designImagePaths)
    : {}

  type RawClientUpdate = { id?: unknown; date?: unknown; text?: unknown }
  const rawUpdates: RawClientUpdate[] = Array.isArray(d.client_updates) ? (d.client_updates as RawClientUpdate[]) : []
  const clientUpdates = rawUpdates
    .filter((u) => u.date && u.text)
    .map((u) => ({ id: String(u.id ?? crypto.randomUUID()), date: String(u.date), text: String(u.text) }))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Line items: prefer order-level data, then fall back to related quote.
  // `sizes` is the only production-spec field allowed through to the client (blank/
  // colors/print_detail stay internal); it's whitelisted explicitly like the others.
  type RawLineItem = { name?: unknown; description?: unknown; quantity?: unknown; unitPrice?: unknown; lineTotal?: unknown; originalUnitPrice?: unknown; sizes?: unknown }
  let lineItems: { name: string; description: string; quantity: number; unitPrice: number; lineTotal: number; originalUnitPrice?: number; sizes?: SizeQty[] }[] = []

  const mapLineItem = (li: RawLineItem) => {
    const sizes = normalizeSizes(li.sizes)
    return {
      name: String(li.name ?? ''),
      description: String(li.description ?? ''),
      quantity: Number(li.quantity ?? 0),
      unitPrice: Number(li.unitPrice ?? 0),
      lineTotal: Number(li.lineTotal ?? 0),
      ...(li.originalUnitPrice != null ? { originalUnitPrice: Number(li.originalUnitPrice) } : {}),
      ...(sizes.length > 0 ? { sizes } : {}),
    }
  }

  if (Array.isArray(d.line_items) && (d.line_items as RawLineItem[]).length > 0) {
    lineItems = (d.line_items as RawLineItem[]).map(mapLineItem)
  } else if (d.quote_id) {
    const { data: quoteRows } = await db
      .from('quotes')
      .select('data')
      .eq('id', d.quote_id as string)
      .limit(1)
    if (quoteRows && quoteRows.length > 0) {
      const qd = quoteRows[0].data as Record<string, unknown>
      if (discountVal === null && qd.discount != null) discountVal = normalizeDiscount(qd.discount)
      if (Array.isArray(qd.line_items)) {
        lineItems = (qd.line_items as RawLineItem[]).map(mapLineItem)
      }
    }
  }

  const clientSafeData = {
    orderId: order.id,
    clientName: d.client || d.client_name || d.company_name || '',
    orderName: d.orderName || d.order_name || d.name || '',
    collectionName: d.collection_name || d.orderName || d.order_name || '',
    status: d.status || d.current_status || '',
    currentPhase: d.current_phase || d.phase || d.status || '',
    // Prefer the smart estDelivery (formatted); fall back to legacy free-text fields.
    estimatedDelivery: (d.estDelivery ? fmtDeliveryDate(d.estDelivery as string) : '') || d.estimated_delivery || d.estimatedDeliveryDate || d.est_delivery || '',
    quantity: d.quantity || '',
    items: Array.isArray(d.items) ? d.items.join(', ') : d.items || '',
    invoiceTotal: (grandTotalVal ?? totalAmount) > 0 ? (grandTotalVal ?? totalAmount) : '',
    subtotal: subtotalVal,
    discount: discountVal,
    salesTaxRate: salesTaxRateVal,
    salesTaxAmount: salesTaxAmountVal,
    grandTotal: grandTotalVal,
    depositAmount: depositAmountVal > 0 ? depositAmountVal : '',
    depositPaid: depositIsPaid,
    finalPaid: finalIsPaid,
    balanceDue,
    paymentStatus,
    stripeInvoiceUrl: d.stripe_invoice_url || '',
    // tfi- invoice pay page (from the linked finances row). Empty when no invoice has
    // been generated yet — the portal hides the "Pay final balance" button in that case.
    invoicePayUrl: inv?.public_link || '',
    designVersions: visibleDesignVersions.map((v) => ({
      ...v,
      file_url: v.drive_url || v.file_url || '',
      image_signed_url: (typeof v.image_path === 'string' && v.image_path)
        ? (designImageUrls[v.image_path] ?? null)
        : null,
    })),
    clientNotes: d.client_notes || '',
    lastUpdated: String(d.portal_generated_at ?? '') || '',
    clientUpdates,
    lineItems,
  }

  // Intake summary — client-safe fields only, private files excluded
  type RawFile = Record<string, unknown>
  let intakeSummary: Record<string, unknown> | null = null
  const snap = d.intake_snapshot as Record<string, unknown> | null | undefined
  if (snap && typeof snap === 'object') {
    const rawFiles: RawFile[] = Array.isArray(snap.files) ? (snap.files as RawFile[]) : []
    const visibleFiles = rawFiles.filter(f => f.visible_to_client === true)

    let files: Record<string, unknown>[] = []
    if (visibleFiles.length > 0) {
      const paths = visibleFiles.map(f => String(f.path || ''))
      const urlMap = await getSignedUrls(paths)
      files = visibleFiles.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mime_type: f.mime_type,
        category: f.category,
        signed_url: urlMap[String(f.path)] ?? null,
      }))
    }

    intakeSummary = {
      contact_title: snap.contact_title || '',
      contact_method: snap.contact_method || '',
      company_description: snap.company_description || '',
      quantity: snap.quantity || '',
      target_date: snap.target_date || '',
      project_timeline: snap.project_timeline || '',
      budget: snap.budget || '',
      apparel_types: snap.apparel_types || '',
      audience: snap.audience || '',
      station_code: snap.station_code || '',
      meaning: snap.meaning || '',
      style: snap.style || '',
      colors: snap.colors || '',
      submitted_at: String(d.created_at || ''),
      files,
    }
  }

  return NextResponse.json({ ...clientSafeData, intakeSummary })
}
