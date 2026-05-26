import webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'

// push_subscriptions columns: endpoint, auth, p256dh, user_agent, created_at, updated_at
type StoredSub = { endpoint: string; auth: string; p256dh: string }

function vapidConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  )
}

export async function sendPushToAll(payload: { title: string; message: string; url?: string }): Promise<void> {
  if (!vapidConfigured()) {
    console.warn('[sendPush] VAPID keys not fully configured — skipping push. Need NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.')
    return
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const supabase = getSupabaseAdmin()
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, auth, p256dh')

  if (error) {
    console.error('[sendPush] failed to fetch subscriptions:', error)
    return
  }

  const rows = (subs ?? []) as StoredSub[]
  console.log(`[sendPush] subscriptions found: ${rows.length}`)

  if (rows.length === 0) return

  const pushPayload = JSON.stringify({ title: payload.title, message: payload.message, url: payload.url ?? '/' })
  const staleEndpoints: string[] = []

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = { endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } }
      try {
        await webpush.sendNotification(subscription, pushPayload)
        console.log(`[sendPush] sent → ${row.endpoint.slice(0, 60)}…`)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        console.error(`[sendPush] failed → ${row.endpoint.slice(0, 60)}… status=${status ?? 'unknown'}`, err)
        if (status === 410 || status === 404) {
          staleEndpoints.push(row.endpoint)
        }
      }
    }),
  )

  // Clean up expired/invalid subscriptions
  for (const ep of staleEndpoints) {
    console.log(`[sendPush] removing stale subscription: ${ep.slice(0, 60)}…`)
    await supabase.from('push_subscriptions').delete().eq('endpoint', ep)
  }
}
