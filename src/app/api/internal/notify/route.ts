import { NextResponse } from 'next/server'
import { createNotification, type NotificationPayload } from '@/lib/notifications'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Partial<NotificationPayload>
    if (!body.type || !body.title) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    await createNotification({
      type: body.type,
      title: body.title,
      message: body.message ?? '',
      entity_type: body.entity_type ?? '',
      entity_id: body.entity_id ?? '',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[notify]', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
