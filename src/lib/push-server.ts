import webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'

type PushRecord = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const vapid = getVapidConfig()
  if (!vapid) return // push not configured — skip silently

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const db = getSupabaseAdmin()
  const { data: subs, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (error || !subs || subs.length === 0) return

  const results = await Promise.allSettled(
    (subs as PushRecord[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        )
      } catch (err: unknown) {
        // 410 Gone or 404 = subscription expired; remove it
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await db.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          throw err
        }
      }
    }),
  )

  // Log failures but don't throw — push is best-effort
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[push-server] sendNotification error:', r.reason)
    }
  }
}
