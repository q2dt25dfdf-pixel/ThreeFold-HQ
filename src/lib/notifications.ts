import { getSupabaseAdmin } from './supabase-admin'

export type NotificationType =
  | 'deposit_received'
  | 'final_invoice_paid'
  | 'new_order'
  | 'new_client'
  | 'quote_sent'
  | 'deposit_request_sent'
  | 'design_approved'
  | 'order_created'
  | 'client_created'
  | 'portal_email_sent'
  | 'final_invoice_sent'
  | 'ach_payment_cleared'
  | 'ach_payment_failed'

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
  await db.from('notifications').insert({
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
}
