import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  const body = await request.json() as { subscription?: { endpoint?: string } }
  const sub = body.subscription
  if (!sub?.endpoint) {
    return NextResponse.json({ error: 'Missing subscription endpoint' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, subscription: sub, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
  if (error) {
    console.error('[push/subscribe] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  const supabase = getSupabaseAdmin()
  await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}
