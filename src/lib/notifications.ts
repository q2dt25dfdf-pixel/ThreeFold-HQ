import { getSupabaseAdmin } from './supabase-admin'
import { sendPushToAll } from './sendPush'

export type NotificationType =
  | 'deposit_received'
  | 'final_invoice_paid'
  | 'new_order'
  | 'new_client'
  | 'new_lead'
  | 'quote_sent'
  | 'quote_approved'
  | 'deposit_request_sent'
  | 'design_approved'
  | 'order_created'
  | 'client_created'
  | 'portal_email_sent'
  | 'final_invoice_sent'
  | 'ach_payment_cleared'
  | 'ach_payment_failed'
  | 'calendar_event_created'
  | 'calendar_event_rescheduled'
  | 'calendar_event_cancelled'

export interface NotificationPayload {
  type: NotificationType
  title: string
  message: string
  entity_type: string
  entity_id: string
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
  const db = getSupabaseAdmin()
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const { error } = await db.from('notifications').insert({
    id,
    data: {
      id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      created_at: new Date().toISOString(),
      read: false,
      read_at: null,
    },
  })
  if (error) {
    console.error('[createNotification] DB insert failed:', error)
  } else {
    console.log(`[createNotification] saved: ${payload.type} — ${payload.title}`)
  }

  // Fire push notifications to all subscribed devices (best-effort, non-blocking)
  sendPushToAll({ title: payload.title, message: payload.message }).catch((err) => {
    console.error('[createNotification] push error:', err)
  })
}
