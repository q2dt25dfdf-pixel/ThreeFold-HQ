'use client'

import { useEffect, useState } from 'react'
import { ClipboardCopy, ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function PortalSection({ orderId }) {
  const [token, setToken] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portalUrl, setPortalUrl] = useState('')

  useEffect(() => {
    if (token) setPortalUrl(window.location.origin + '/portal/' + token)
  }, [token])

  useEffect(() => {
    supabase.from('orders').select('data').eq('id', orderId).single()
      .then(({ data }) => {
        if (data?.data?.portal_token) {
          setToken(data.data.portal_token)
          setEnabled(data.data.portal_enabled ?? true)
        }
        setLoading(false)
      })
  }, [orderId])

  async function generateLink() {
    setGenerating(true)
    const res = await fetch('/api/portal/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const result = await res.json()
    if (result.token) { setToken(result.token); setEnabled(true) }
    setGenerating(false)
  }

  async function toggleEnabled() {
    const next = !enabled
    const { data: row } = await supabase.from('orders').select('data').eq('id', orderId).single()
    if (row) {
      await supabase.from('orders').update({
        data: { ...row.data, portal_enabled: next },
        updated_at: new Date().toISOString(),
      }).eq('id', orderId)
    }
    setEnabled(next)
  }

  async function copyLink() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return null

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Client Portal</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {token ? (enabled ? 'Portal active' : 'Portal disabled') : 'No portal link generated yet'}
          </p>
        </div>
        {token && (
          <span className={enabled ? 'rounded-full px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700' : 'rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-500'}>
            {enabled ? 'Active' : 'Disabled'}
          </span>
        )}
      </div>

      {token && portalUrl && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="truncate text-xs text-slate-500">{portalUrl}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!token ? (
          <button onClick={generateLink} disabled={generating}
            className="rounded-3xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {generating ? 'Generating...' : 'Generate Portal Link'}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button onClick={copyLink}
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <ClipboardCopy size={13} />
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <ExternalLink size={13} />
              Preview
            </a>
            <button onClick={generateLink} disabled={generating}
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={13} />
              Regenerate
            </button>
            <button onClick={toggleEnabled}
              className="rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {enabled ? 'Disable Portal' : 'Enable Portal'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
