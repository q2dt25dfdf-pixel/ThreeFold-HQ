import { NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'

export async function POST() {
  try {
    await createNotification({
      type: 'new_order',
      title: 'Test Notification',
      message: 'This is a test notification from ThreeFold HQ.',
      entity_type: '',
      entity_id: '',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[test-notification]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
