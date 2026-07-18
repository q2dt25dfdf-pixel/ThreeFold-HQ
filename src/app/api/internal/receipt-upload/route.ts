import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { validateSessionRequest } from '@/lib/sessionAuth'

export const dynamic = 'force-dynamic'

// Only crypto ids / kebab ids reach here (order.id, cost line crypto.randomUUID). The
// allowlist rejects '/' and '..' so the storage path can't be traversed.
const SAFE_ID = /^[A-Za-z0-9_-]+$/

// Auth-gated, service-role receipt upload. The browser can't upload directly to the
// private order-receipts bucket (RLS rejects the anon/browser role), so it posts the
// file here; validateSessionRequest proves a logged-in HQ user, then the service-role
// client writes the object (bypassing RLS). Keeps order-receipts fully private.
export async function POST(request: Request) {
  const auth = await validateSessionRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: auth.status })
  }
  try {
    const form = await request.formData()
    const file = form.get('file')
    const orderId = String(form.get('orderId') ?? '')
    const lineId = String(form.get('lineId') ?? '')

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }
    if (!SAFE_ID.test(orderId) || !SAFE_ID.test(lineId)) {
      return NextResponse.json({ success: false, error: 'Invalid order or line id' }, { status: 400 })
    }

    const path = `orders/${orderId}/${lineId}/receipt`
    const bytes = await file.arrayBuffer()

    const { error } = await getSupabaseAdmin().storage
      .from('order-receipts')
      .upload(path, bytes, { upsert: true, contentType: file.type || 'application/octet-stream' })

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, path })
  } catch {
    return NextResponse.json({ success: false, error: 'Upload failed' }, { status: 500 })
  }
}
