import webpush from 'web-push'
import { getSupabaseAdmin } from './supabase-admin'

// push_subscriptions columns: endpoint, auth, p256dh, user_agent, created_at, updated_at
type StoredSub = { endpoint: string; auth: string; p256dh: string }

export type PushResult = {
  configured: boolean
  subscriptionsFound: number
  attempted: number
  sent: number
  failed: number
  failures: { endpointHost: string; statusCode: number | null; message: string }[]
  skippedReason?: string
}

function missingVapidVars(): string | null {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'NEXT_PUBLIC_VAPID_PUBLIC_KEY'
  if (!process.env.VAPID_PRIVATE_KEY) return 'VAPID_PRIVATE_KEY'
  if (!process.env.VAPID_SUBJECT) return 'VAPID_SUBJECT'
  return null
}

export async function sendPushToAll(payload: { title: string; message: string; url?: string }): Promise<PushResult> {
  const missing = missingVapidVars()
  if (missing) {
    const reason = `Missing env var: ${missing}`
    console.warn(`[sendPush] ${reason} — push skipped`)
    return { configured: false, subscriptionsFound: 0, attempted: 0, sent: 0, failed: 0, failures: [], skippedReason: reason }
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const supabase = getSupabaseAdmin()
  const { data: subs, error: dbErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, auth, p256dh')

  if (dbErr) {
    const reason = `DB error: ${dbErr.message}`
    console.error('[sendPush] failed to fetch subscriptions:', dbErr)
    return { configured: true, subscriptionsFound: 0, attempted: 0, sent: 0, failed: 0, failures: [], skippedReason: reason }
  }

  const rows = (subs ?? []) as StoredSub[]
  console.log(`[sendPush] subscriptions found: ${rows.length}`)

  if (rows.length === 0) {
    return { configured: true, subscriptionsFound: 0, attempted: 0, sent: 0, failed: 0, failures: [], skippedReason: 'No subscribed devices found' }
  }

  const pushPayload = JSON.stringify({ title: payload.title, message: payload.message, url: payload.url ?? '/' })
  const staleEndpoints: string[] = []
  let sent = 0
  const failures: PushResult['failures'] = []

  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = { endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } }
      let endpointHost = row.endpoint
      try { endpointHost = new URL(row.endpoint).host } catch { /* keep full url */ }

      try {
        await webpush.sendNotification(subscription, pushPayload)
        sent++
        console.log(`[sendPush] sent → ${endpointHost}`)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? null
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[sendPush] failed → ${endpointHost} status=${status ?? 'unknown'} ${message}`)
        failures.push({ endpointHost, statusCode: status, message })
        if (status === 410 || status === 404) staleEndpoints.push(row.endpoint)
      }
    }),
  )

  for (const ep of staleEndpoints) {
    console.log(`[sendPush] removing stale subscription: ${ep.slice(0, 60)}…`)
    await supabase.from('push_subscriptions').delete().eq('endpoint', ep)
  }

  return {
    configured: true,
    subscriptionsFound: rows.length,
    attempted: rows.length,
    sent,
    failed: failures.length,
    failures,
  }
}
