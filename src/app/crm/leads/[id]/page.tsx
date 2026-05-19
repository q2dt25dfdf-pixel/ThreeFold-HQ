'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Globe, Building2, User, Package, Palette, Paperclip } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LoadingState } from '@/components/AppState'
import type { Lead } from '@/components/crm/types'
import { getSignedUrls } from '@/lib/getSignedUrl'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function categoryBadgeClass(category: string): string {
  const map: Record<string, string> = {
    logo: 'bg-blue-100 text-blue-700',
    inspiration: 'bg-purple-100 text-purple-700',
    pdf: 'bg-red-100 text-red-700',
    mockup: 'bg-amber-100 text-amber-700',
    other: 'bg-slate-100 text-slate-600',
  }
  return map[category] ?? 'bg-slate-100 text-slate-600'
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 lg:p-7">
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
      <p className="text-sm text-slate-900 lg:text-base">{value}</p>
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
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('crm_leads').select('data').eq('id', params.id).single()
      .then(({ data }) => {
        if (data?.data) setLead(data.data as Lead)
        setLoading(false)
      })
  }, [params.id])

  useEffect(() => {
    const files = lead?.questionnaire_files
    if (!files?.length) return
    getSignedUrls(files.map((f) => f.path)).then(setFileUrls)
  }, [lead?.id])

  if (loading) return <LoadingState />

  if (!lead) return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Lead not found.</p>
    </div>
  )

  const d = lead as Lead & Record<string, string>

  return (
    <div className="min-h-screen bg-zinc-100 px-4 pb-16 pt-6 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">

        <button
          onClick={() => router.push('/crm')}
          className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={14} />
          Back to CRM
        </button>

        <div className="mb-6 rounded-3xl bg-slate-950 px-6 py-5 text-white lg:px-8 lg:py-7">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Website Questionnaire</p>
          <h1 className="text-xl font-bold lg:text-2xl">{lead.company}</h1>
          <p className="mt-1 text-sm text-slate-400 lg:text-base">{lead.contact} · {lead.email} · {lead.phone}</p>
          {d.created_at && (
            <p className="mt-2 text-xs text-slate-500">Submitted {new Date(d.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

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

          {(lead.questionnaire_files?.length ?? 0) > 0 && (
            <div className="lg:col-span-2">
              <Section icon={<Paperclip size={15} />} title="05 — Uploaded Files">
                <div className="flex flex-col gap-2">
                  {lead.questionnaire_files!.map((file) => {
                    const url = fileUrls[file.path]
                    return (
                      <div key={file.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-900">{file.name}</p>
                          <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryBadgeClass(file.category)}`}>
                            {file.category}
                          </span>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-slate-900 px-3 py-1 text-[10px] font-semibold text-white hover:bg-slate-700">
                              Download
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400">Loading…</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            </div>
          )}

          <div className="lg:col-span-2">
            <Section icon={<Globe size={15} />} title="Lead Info">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Field label="Source" value={d.source} />
                <Field label="Stage" value={lead.stage} />
                <Field label="Status" value={lead.status} />
                <Field label="Assigned To" value={lead.owner || 'Unassigned'} />
              </div>
            </Section>
          </div>

        </div>
      </div>
    </div>
  )
}
