import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// push_subscriptions table columns (confirmed via live schema probe):
//   endpoint text, auth text, p256dh text, user_agent text, created_at, updated_at
// endpoint is the natural unique key.

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

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
  const serviceRolePresent = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  const debug = {
    endpointReceived: !!endpoint,
    authReceived: !!auth,
    p256dhReceived: !!p256dh,
    serviceRolePresent,
    insertAttempted: false,
    insertSucceeded: false,
    exactError: null as string | null,
  }

  console.log('[push/subscribe] fields received:', { endpoint: !!endpoint, auth: !!auth, p256dh: !!p256dh, serviceRolePresent })

  if (!endpoint || !auth || !p256dh) {
    console.error('[push/subscribe] missing required fields')
    return NextResponse.json({ ok: false, debug }, { status: 400 })
  }

  let supabase
  try {
    supabase = getServiceClient()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[push/subscribe] service role client error:', msg)
    debug.exactError = msg
    return NextResponse.json({ ok: false, debug }, { status: 500 })
  }

  const userAgent = request.headers.get('user-agent') ?? ''
  const now = new Date().toISOString()

  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)

  debug.insertAttempted = true
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
    debug.exactError = error.message
    return NextResponse.json({ ok: false, debug }, { status: 500 })
  }

  debug.insertSucceeded = true
  console.log('[push/subscribe] saved subscription for', endpoint.slice(0, 60) + '…')
  return NextResponse.json({ ok: true, debug })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { endpoint?: string }
  if (!body.endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  let supabase
  try {
    supabase = getServiceClient()
  } catch (err) {
    console.error('[push/subscribe] service role client error:', err)
    return NextResponse.json({ error: 'Server configuration error — SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  if (error) {
    console.error('[push/subscribe] delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[push/subscribe] removed subscription for', body.endpoint.slice(0, 60) + '…')
  return NextResponse.json({ ok: true })
}
