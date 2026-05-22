import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSignedUrls, getDesignSignedUrls } from '@/lib/getSignedUrl'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const { data: orders, error } = await supabase
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

  const clientSafeData = {
    orderId: order.id,
    clientName: d.client || d.client_name || d.company_name || '',
    orderName: d.orderName || d.order_name || d.name || '',
    collectionName: d.collection_name || d.orderName || d.order_name || '',
    status: d.status || d.current_status || '',
    currentPhase: d.current_phase || d.phase || d.status || '',
    estimatedDelivery: d.estimated_delivery || d.estimatedDeliveryDate || d.est_delivery || '',
    quantity: d.quantity || '',
    items: Array.isArray(d.items) ? d.items.join(', ') : d.items || '',
    invoiceTotal: d.invoice_total || d.amount || '',
    depositPaid: d.deposit_paid || '',
    balanceDue: d.balance_due || '',
    stripeInvoiceUrl: d.stripe_invoice_url || '',
    designVersions: visibleDesignVersions.map((v) => ({
      ...v,
      // Drive fallback preserved exactly as before
      file_url: v.drive_url || v.file_url || '',
      // Signed URL for directly uploaded image (null when image_path absent)
      image_signed_url: (typeof v.image_path === 'string' && v.image_path)
        ? (designImageUrls[v.image_path] ?? null)
        : null,
    })),
    clientNotes: d.client_notes || '',
    lastUpdated: String(d.portal_generated_at ?? '') || '',
    clientUpdates,
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
      notes: snap.notes || '',
      submitted_at: String(d.created_at || ''),
      files,
    }
  }

  return NextResponse.json({ ...clientSafeData, intakeSummary })
}
