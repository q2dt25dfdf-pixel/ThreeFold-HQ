'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Globe, Building2, User, Package, Palette, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LoadingState } from '@/components/AppState'
import type { Lead } from '@/components/crm/types'

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-slate-100" />
}

export default function LeadQuestionnairePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('crm_leads').select('data').eq('id', params.id).single()
      .then(({ data }) => {
        if (data?.data) setLead(data.data as Lead)
        setLoading(false)
      })
  }, [params.id])

  if (loading) return <LoadingState />

  if (!lead) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Lead not found.</p>
    </div>
  )

  const d = lead as Lead & Record<string, string>

  return (
    <div className="min-h-screen bg-zinc-100 px-4 pb-16 pt-6 md:px-8">
      <div className="mx-auto max-w-3xl">

        <button
          onClick={() => router.push('/crm')}
          className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={14} />
          Back to CRM
        </button>

        <div className="mb-6 rounded-3xl bg-slate-950 px-6 py-5 text-white">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Website Questionnaire</p>
          <h1 className="text-xl font-bold">{lead.company}</h1>
          <p className="mt-1 text-sm text-slate-400">{lead.contact} · {lead.email} · {lead.phone}</p>
          {d.created_at && (
            <p className="mt-2 text-xs text-slate-500">Submitted {new Date(d.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          )}
        </div>

        <div className="flex flex-col gap-4">

          <Section icon={<Building2 size={15} />} title="01 — About Your Company">
            <Field label="Company Name" value={lead.company} />
            <Divider />
            <Field label="Company Type" value={lead.companyProfile?.industry} />
            <Divider />
            <Field label="What does your company do?" value={d.company_description} />
          </Section>

          <Section icon={<User size={15} />} title="02 — About You">
            <Field label="Contact Name" value={lead.contact} />
            <Divider />
            <Field label="Role / Title" value={d.contact_title} />
            <Divider />
            <Field label="Phone" value={lead.phone} />
            <Divider />
            <Field label="Email" value={lead.email} />
            <Divider />
            <Field label="Preferred Contact Method" value={d.contact_method} />
          </Section>

          <Section icon={<Package size={15} />} title="03 — Order Details">
            <Field label="Quantity Range" value={d.quantity} />
            <Divider />
            <Field label="Target Date" value={d.target_date} />
            <Divider />
            <Field label="Budget Range" value={d.budget} />
            <Divider />
            <Field label="Apparel Types" value={d.apparel_types} />
            <Divider />
            <Field label="Who is this for?" value={d.audience} />
            <Divider />
            <Field label="Station Code / Location" value={d.station_code} />
          </Section>

          <Section icon={<Palette size={15} />} title="04 — Design Direction">
            <Field label="What should this apparel represent?" value={d.meaning} />
            <Divider />
            <Field label="Style Direction" value={d.style} />
            <Divider />
            <Field label="Color Preferences" value={d.colors} />
            <Divider />
            <Field label="Additional Notes" value={lead.notes} />
          </Section>

          <Section icon={<Globe size={15} />} title="Lead Info">
            <Field label="Source" value={d.source} />
            <Divider />
            <Field label="Stage" value={lead.stage} />
            <Divider />
            <Field label="Status" value={lead.status} />
            <Divider />
            <Field label="Assigned To" value={lead.owner || 'Unassigned'} />
          </Section>

        </div>
      </div>
    </div>
  )
}
