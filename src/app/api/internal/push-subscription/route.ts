import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// Save a new push subscription
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
      userAgent?: string
      userId?: string
    }

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })
    }

    const id = `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const db = getSupabaseAdmin()

    const { error } = await db.from('push_subscriptions').upsert(
      {
        id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_id: body.userId ?? null,
        user_agent: body.userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) {
      console.error('[push-subscription] upsert error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push-subscription] POST error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// Remove a push subscription
export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { endpoint?: string }
    if (!body.endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    }

    const db = getSupabaseAdmin()
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint)

    if (error) {
      console.error('[push-subscription] delete error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push-subscription] DELETE error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
