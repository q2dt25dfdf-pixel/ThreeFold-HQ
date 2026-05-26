import { NextResponse } from 'next/server'
import { sendPushToAll } from '@/lib/sendPush'

export async function POST() {
  console.log('[push/test] sending test push notification to all subscriptions')
  try {
    await sendPushToAll({
      title: 'ThreeFold HQ',
      message: 'Test push notification — working!',
      url: '/',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/test] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
