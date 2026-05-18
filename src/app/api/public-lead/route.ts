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

    if (body['bot-field']) {
      return NextResponse.json({ success: true }, { headers })
    }

    const required = ['company_name', 'company_type', 'contact_name', 'contact_email', 'contact_phone', 'meaning']
    const missing = required.filter(f => !body[f]?.toString().trim())
    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing required fields', fields: missing }, { status: 400, headers })
    }

    const id = 'lead-' + randomUUID()
    const now = new Date().toISOString()

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
      budget: body.budget?.trim() || '',
      apparel_types: body.apparel_types?.trim() || '',
      audience: body.audience?.trim() || '',
      station_code: body.station_code?.trim() || '',
      meaning: body.meaning?.trim() || '',
      style: body.style?.trim() || '',
      colors: body.colors?.trim() || '',
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
