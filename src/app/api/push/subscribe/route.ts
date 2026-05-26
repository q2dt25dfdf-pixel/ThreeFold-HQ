import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// push_subscriptions table columns (confirmed via live schema probe):
//   endpoint text, auth text, p256dh text, user_agent text, created_at, updated_at
// id is auto-generated; endpoint is the natural unique key.

type PushSubBody = {
  subscription?: {
    endpoint?: string
    keys?: { auth?: string; p256dh?: string }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as PushSubBody
  const sub = body.subscription
  const endpoint = sub?.endpoint
  const auth = sub?.keys?.auth
  const p256dh = sub?.keys?.p256dh

  if (!endpoint || !auth || !p256dh) {
    console.error('[push/subscribe] missing fields', { endpoint: !!endpoint, auth: !!auth, p256dh: !!p256dh })
    return NextResponse.json({ error: 'Missing endpoint, auth, or p256dh' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const userAgent = request.headers.get('user-agent') ?? ''
  const now = new Date().toISOString()

  // Delete any existing row for this endpoint, then insert fresh.
  // Avoids needing to know whether endpoint has a unique index.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint,
    auth,
    p256dh,
    user_agent: userAgent,
    created_at: now,
    updated_at: now,
  })

  if (error) {
    console.error('[push/subscribe] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[push/subscribe] saved subscription for', endpoint.slice(0, 60) + '…')
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  if (error) {
    console.error('[push/subscribe] delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[push/subscribe] removed subscription for', body.endpoint.slice(0, 60) + '…')
  return NextResponse.json({ ok: true })
}
