import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { randomUUID } from 'crypto'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'https://three-fold-hq.vercel.app',
]

function corsHeaders(origin: string | null) {
  const allowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.netlify.app') ||
    origin.endsWith('.netlify.com')
  )
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)

  try {
    const body = await request.json()

    // Honeypot check
    if (body['bot-field']) {
      return NextResponse.json({ success: true }, { headers })
    }

    // Required field validation
    const required = ['company_name', 'company_type', 'contact_name', 'contact_email', 'contact_phone', 'meaning']
    const missing = required.filter(f => !body[f]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Missing required fields', fields: missing },
        { status: 400, headers }
      )
    }

    const id = 'lead-' + randomUUID()
    const now = new Date().toISOString()

    const leadData = {
      id,
      company_name: body.company_name?.trim() || '',
      company_type: body.company_type?.trim() || '',
      company_description: body.company_description?.trim() || '',
      contact_name: body.contact_name?.trim() || '',
      contact_title: body.contact_title?.trim() || '',
      contact_phone: body.contact_phone?.trim() || '',
      contact_email: body.contact_email?.trim() || '',
      contact_method: body.contact_method?.trim() || '',
      quantity: body.quantity?.trim() || '',
      target_date: body.target_date?.trim() || '',
      budget: body.budget?.trim() || '',
      apparel_types: body.apparel_types?.trim() || '',
      audience: body.audience?.trim() || '',
      station_code: body.station_code?.trim() || '',
      meaning: body.meaning?.trim() || '',
      style: body.style?.trim() || '',
      colors: body.colors?.trim() || '',
      notes: body.notes?.trim() || '',
      value: '0',
      source: 'Website',
      status: 'New Lead',
      owner: '',
      created_at: now,
      updated_at: now,
    }

    const { error } = await supabase
      .from('crm_leads')
      .insert({ id, data: leadData, updated_at: now })

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500, headers })
    }

    return NextResponse.json({ success: true, id }, { headers })

  } catch (err) {
    console.error('public-lead error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers })
  }
}
