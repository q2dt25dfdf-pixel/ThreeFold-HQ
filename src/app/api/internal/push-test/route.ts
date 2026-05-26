import { NextResponse } from 'next/server'
import { sendPushToAll } from '@/lib/push-server'

export async function POST() {
  try {
    await sendPushToAll({
      title: 'Threefold HQ',
      body: 'Push notifications are working on your device.',
      url: '/',
      tag: 'threefold-hq-test',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push-test]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
