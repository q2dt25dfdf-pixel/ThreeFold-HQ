import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  const clientSafeData = {
    orderId: order.id,
    clientName: d.client_name || d.client || d.company_name || '',
    orderName: d.order_name || d.orderName || d.name || '',
    collectionName: d.collection_name || d.orderName || '',
    status: d.status || d.current_status || '',
    currentPhase: d.current_phase || d.phase || d.status || '',
    estimatedDelivery: d.estimated_delivery || d.estimatedDeliveryDate || d.est_delivery || '',
    quantity: d.quantity || '',
    items: Array.isArray(d.items) ? d.items.join(', ') : d.items || '',
    invoiceTotal: d.invoice_total || d.amount || '',
    depositPaid: d.deposit_paid || '',
    balanceDue: d.balance_due || '',
    stripeInvoiceUrl: d.stripe_invoice_url || '',
    designVersions: (d.design_versions || []).filter((v: Record<string, unknown>) => v.visible_to_client !== false),
    clientNotes: d.client_notes || '',
  }

  return NextResponse.json(clientSafeData)
}
