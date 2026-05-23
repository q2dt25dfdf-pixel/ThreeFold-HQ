import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const id =
      typeof body.id === 'string' && body.id
        ? body.id
        : `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const notification = {
      id,
      type: 'new_order',
      title: 'Test Notification',
      message: 'This is a test notification from ThreeFold HQ.',
      entity_type: '',
      entity_id: '',
      created_at: new Date().toISOString(),
      read: false,
      read_at: null as null,
    }

    const db = getSupabaseAdmin()
    const { error } = await db.from('notifications').insert({ id, data: notification })

    if (error) {
      console.error('[test-notification] insert error', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, notification })
  } catch (err) {
    console.error('[test-notification]', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
