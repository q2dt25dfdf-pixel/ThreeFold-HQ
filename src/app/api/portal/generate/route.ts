import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { supabase } from '@/lib/supabase'
import { validateSessionRequest } from '@/lib/sessionAuth'

export async function POST(request: NextRequest) {
  const auth = await validateSessionRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  try {
    const { orderId } = await request.json()
    if (!orderId) return NextResponse.json({ error: 'Order ID required' }, { status: 400 })

    const token = 'tf-' + randomBytes(12).toString('hex')

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('data')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) return NextResponse.json({ error: 'Order not found', detail: fetchError?.message }, { status: 404 })

    const updatedData = {
      ...order.data,
      portal_token: token,
      portal_enabled: true,
      portal_generated_at: new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ data: updatedData })
      .eq('id', orderId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({ token, orderId })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
