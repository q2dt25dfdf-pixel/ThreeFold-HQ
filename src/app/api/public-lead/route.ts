import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { randomUUID } from 'crypto'
import { createNotification } from '@/lib/notifications'

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function POST(request: Request) {
  const headers = corsHeaders()

  try {
    const body = await request.json()

    if (body['bot-field']) {
      return NextResponse.json({ success: true }, { headers })
    }

    // Lightweight drop-list signup (shop "Get Notified"): email only, no phone required.
    const required = body.company_type === 'Drop Signup'
      ? ['company_name', 'company_type', 'contact_name', 'contact_email', 'meaning']
      : ['company_name', 'company_type', 'contact_name', 'contact_email', 'contact_phone', 'meaning']
    const missing = required.filter(f => !body[f]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing required fields', fields: missing }, { status: 400, headers })
    }

    const now = new Date().toISOString()
    const submittedEmail = body.contact_email?.trim().toLowerCase()
    const submittedCompanyNorm = normalizeForMatch(body.company_name)

    // Build the intake snapshot once — used in both paths
    const incomingFiles = Array.isArray(body.questionnaire_files) ? body.questionnaire_files : []
    const intakeSnapshot = {
      contact_title: body.contact_title?.trim() || '',
      contact_method: body.contact_method?.trim() || '',
      company_description: body.company_description?.trim() || '',
      quantity: body.quantity?.trim() || '',
      target_date: body.target_date?.trim() || '',
      project_timeline: body.project_timeline?.trim() || '',
      budget: body.budget?.trim() || '',
      apparel_types: body.apparel_types?.trim() || '',
      audience: body.audience?.trim() || '',
      station_code: body.station_code?.trim() || '',
      meaning: body.meaning?.trim() || '',
      style: body.style?.trim() || '',
      colors: body.colors?.trim() || '',
      notes: body.notes?.trim() || '',
      files: incomingFiles,
    }

    // Check for exact client match (high confidence only)
    const { data: clientRows } = await supabase.from('clients').select('id, data')
    type ClientRow = { id: string; data: Record<string, unknown> }
    const rows = (clientRows ?? []) as ClientRow[]

    const matchedRow = rows.find((row) => {
      const d = (typeof row.data === 'object' && row.data !== null ? row.data : {}) as Record<string, string>
      const clientEmail = (d.email ?? '').trim().toLowerCase()
      const clientNameNorm = normalizeForMatch(String(d.name ?? ''))
      const clientCompanyNorm = normalizeForMatch(String(d.company ?? ''))
      return (submittedEmail && clientEmail === submittedEmail) ||
        (submittedCompanyNorm.length >= 2 &&
          (clientNameNorm === submittedCompanyNorm ||
            (clientCompanyNorm.length > 0 && clientCompanyNorm === submittedCompanyNorm)))
    })

    // --- Repeat client path: create order directly, no CRM lead ---
    if (matchedRow) {
      const d = (typeof matchedRow.data === 'object' && matchedRow.data !== null ? matchedRow.data : {}) as Record<string, string>
      const clientName = String(d.name || body.company_name)
      const orderId = 'order-repeat-' + randomUUID()
      const orderName = `${clientName} — New Project`

      const orderData = {
        id: orderId,
        orderName,
        order_name: orderName,
        client: clientName,
        client_id: matchedRow.id,
        client_name: clientName,
        vendor: '',
        items: [],
        quantity: 0,
        amount: 0,
        status: 'Production',
        estimatedDeliveryDate: '',
        notes: '',
        source: 'Repeat Client — Website',
        lead_id: '',
        questionnaire_id: '',
        intake_snapshot: intakeSnapshot,
        created_at: now,
        status_changed_at: now,
        updated_at: now,
      }

      const { error: orderError } = await supabase
        .from('orders')
        .insert({ id: orderId, data: orderData })

      if (orderError) {
        console.error('Supabase order insert error:', orderError)
        return NextResponse.json({ error: 'Failed to save order' }, { status: 500, headers })
      }

      return NextResponse.json({ success: true, id: orderId, route: 'repeat_client_order' }, { headers })
    }

    // --- New lead path: unchanged ---
    const id = 'lead-' + randomUUID()

    const leadData = {
      id,
      // Core Lead type fields — these power the CRM kanban display
      company: body.company_name?.trim() || '',
      contact: body.contact_name?.trim() || '',
      email: body.contact_email?.trim() || '',
      phone: body.contact_phone?.trim() || '',
      value: '0',
      notes: body.notes?.trim() || '',
      owner: '',
      stage: 'New Lead',
      status: 'Open',
      followUpDate: '',
      communicationHistory: [],
      companyProfile: {
        industry: body.company_type?.trim() || '',
        address: '',
        website: '',
      },
      // Source and questionnaire fields
      source: 'Website',
      contact_title: body.contact_title?.trim() || '',
      contact_method: body.contact_method?.trim() || '',
      company_description: body.company_description?.trim() || '',
      quantity: body.quantity?.trim() || '',
      target_date: body.target_date?.trim() || '',
      project_timeline: body.project_timeline?.trim() || '',
      budget: body.budget?.trim() || '',
      apparel_types: body.apparel_types?.trim() || '',
      audience: body.audience?.trim() || '',
      station_code: body.station_code?.trim() || '',
      meaning: body.meaning?.trim() || '',
      style: body.style?.trim() || '',
      colors: body.colors?.trim() || '',
      questionnaire_files: incomingFiles,
      created_at: now,
      // Initial stage ('New Lead') counts as a stage-set, so stamp stage_changed_at at
      // creation too — a website lead has real lifecycle timestamps from day one.
      stage_changed_at: now,
      last_activity_at: now,
      updated_at: now,
    }

    const { error } = await supabase
      .from('crm_leads')
      .insert({ id, data: leadData, updated_at: now })

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500, headers })
    }

    // Fire notification — best-effort, never blocks the response
    createNotification({
      type: 'new_lead',
      title: 'New Lead',
      message: `${leadData.company || leadData.contact || 'New submission'} · New project request received.`,
      entity_type: 'lead',
      entity_id: id,
    }).catch(err => console.error('[public-lead] notification error:', err))

    return NextResponse.json({ success: true, id, route: 'new_lead' }, { headers })

  } catch (err) {
    console.error('public-lead error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers })
  }
}
