'use client'

import { useEffect, useState } from 'react'
import { Check, CheckCircle, Copy, ExternalLink, Loader2, RefreshCw, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ModalShell from '@/components/ModalShell'
import { openEmailCompose } from '@/lib/emailCompose'
import { getClientPublicBaseUrl } from '@/lib/publicUrl'

type CopyTarget = 'subject' | 'body' | 'link'
type EmailStep = 'preview' | 'sending' | 'sent' | 'error'

export default function PortalSection({ orderId }: { orderId: string }) {
  const [token, setToken] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [portalUrl, setPortalUrl] = useState<string>('')

  // Order/client data for the email modal
  const [clientName, setClientName] = useState('')
  const [orderName, setOrderName] = useState('')
  const [orderNumber, setOrderNumber] = useState('')

  // Email modal state
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailStep, setEmailStep] = useState<EmailStep>('preview')
  const [emailError, setEmailError] = useState('')
  const [emailCopied, setEmailCopied] = useState<CopyTarget | ''>('')

  useEffect(() => {
    if (token) setPortalUrl(getClientPublicBaseUrl() + '/portal/' + token)
  }, [token])

  useEffect(() => {
    supabase.from('orders').select('data').eq('id', orderId).single()
      .then(async ({ data }) => {
        if (data?.data) {
          const d = data.data as Record<string, unknown>
          if (d.portal_token) {
            setToken(d.portal_token as string)
            setEnabled((d.portal_enabled as boolean) ?? true)
          }
          const name = (d.client_name as string) || (d.client as string) || ''
          const oName = (d.order_name as string) || (d.orderName as string) || ''
          const oNum = (d.order_number as string) || ''
          setClientName(name)
          setOrderName(oName)
          setOrderNumber(oNum)

          // Look up client email from the clients table via client_id
          const clientId = d.client_id as string | undefined
          if (clientId) {
            const { data: clientRow } = await supabase
              .from('clients')
              .select('data')
              .eq('id', clientId)
              .single()
            if (clientRow?.data) {
              const cd = clientRow.data as Record<string, unknown>
              setEmailTo((cd.email as string) || '')
            }
          }
        }
        setLoading(false)
      })
  }, [orderId])

  async function generateLink() {
    setGenerating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/portal/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ orderId }),
    })
    const result = await res.json() as { token?: string }
    if (result.token) { setToken(result.token); setEnabled(true) }
    setGenerating(false)
  }

  async function toggleEnabled() {
    const next = !enabled
    const { data: row } = await supabase.from('orders').select('data').eq('id', orderId).single()
    if (row) {
      await supabase.from('orders').update({
        data: { ...row.data, portal_enabled: next },
      }).eq('id', orderId)
    }
    setEnabled(next)
  }

  async function copyUrl() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setUrlCopied(true)
    setTimeout(() => setUrlCopied(false), 2000)
  }

  function openEmailModal() {
    const subject = `Client Portal Access — ${orderName}${orderNumber ? ` — ${orderNumber}` : ''}`
    const body = [
      `Hello ${clientName || 'there'},`,
      '',
      'We have received your deposit and your order is now in production.',
      '',
      'You can access your Client Portal below:',
      '',
      portalUrl,
      '',
      'Inside the portal you can:',
      '',
      '• Track production progress',
      '• View approved designs',
      '• Monitor order status',
      '• Review payment information',
      '• Receive project updates',
      '• View estimated completion and delivery information',
      '',
      'We recommend bookmarking this link for future reference.',
      '',
      'If you have any questions, simply reply to this email.',
      '',
      'Best,',
      'ThreeFold Supply Co.',
    ].join('\n')

    setEmailSubject(subject)
    setEmailBody(body)
    setEmailStep('preview')
    setEmailError('')
    setEmailCopied('')
    setEmailOpen(true)
  }

  function closeEmailModal() {
    setEmailOpen(false)
  }

  async function handleEmailSend() {
    setEmailStep('sending')
    try {
      openEmailCompose({ to: emailTo, subject: emailSubject, body: emailBody })
      setEmailStep('sent')
      void supabase.auth.getSession().then(({ data: { session } }) =>
        fetch('/api/internal/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            type: 'portal_email_sent',
            title: 'Client Portal Email Sent',
            message: `${clientName} · Portal access email delivered.`,
            entity_type: 'order',
            entity_id: orderId,
          }),
        }).catch(err => console.error('[notify]', err))
      )
      window.setTimeout(closeEmailModal, 2000)
    } catch (err: unknown) {
      setEmailError(String(err))
      setEmailStep('error')
    }
  }

  async function copyEmailField(target: CopyTarget, value: string) {
    await navigator.clipboard.writeText(value)
    setEmailCopied(target)
    window.setTimeout(() => setEmailCopied(''), 1800)
  }

  if (loading) return null

  const emailFooter =
    emailStep === 'preview' ? (
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={closeEmailModal}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleEmailSend()}
          className="flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Send size={14} />
          Send Portal Link
        </button>
      </div>
    ) : emailStep === 'error' ? (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={closeEmailModal}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
      </div>
    ) : null

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
          <span className={enabled
            ? 'rounded-full px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700'
            : 'rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-500'
          }>
            {enabled ? 'Active' : 'Disabled'}
          </span>
        )}
      </div>

      {/* URL field with inline copy icon */}
      {token && portalUrl && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="flex-1 truncate text-xs text-slate-500">{portalUrl}</p>
          <button
            type="button"
            onClick={() => void copyUrl()}
            title="Copy portal link"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          >
            {urlCopied
              ? <Check size={13} className="text-emerald-600" />
              : <Copy size={13} />
            }
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!token ? (
          <button
            onClick={() => void generateLink()}
            disabled={generating}
            className="rounded-3xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate Portal Link'}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={openEmailModal}
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Send size={13} />
              Email Portal Link
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink size={13} />
              Preview
            </a>
            <button
              onClick={() => void generateLink()}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={13} />
              Regenerate
            </button>
            <button
              onClick={() => void toggleEnabled()}
              className="rounded-3xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {enabled ? 'Disable Portal' : 'Enable Portal'}
            </button>
          </div>
        )}
      </div>

      {/* Email Portal Link modal */}
      {emailOpen && (
        <ModalShell
          title="Email Portal Link"
          subtitle={`${clientName}${orderName ? ` · ${orderName}` : ''}`}
          onClose={closeEmailModal}
          maxWidth="max-w-2xl"
          footer={emailFooter}
        >
          {emailStep === 'sending' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <p className="text-sm text-slate-600">Opening email...</p>
            </div>
          )}

          {emailStep === 'sent' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
              <p className="text-base font-semibold text-slate-950">Portal Link Sent</p>
              <p className="text-sm text-slate-500">
                The client can now access their portal to track progress and view updates.
              </p>
            </div>
          )}

          {emailStep === 'error' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-6 text-center">
              <p className="text-sm font-semibold text-rose-700">Something went wrong</p>
              <p className="mt-1 text-xs text-rose-600">{emailError}</p>
            </div>
          )}

          {emailStep === 'preview' && (
            <div className="flex flex-col gap-6">
              {/* Portal link strip */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Portal Link</p>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-blue-600 underline"
                >
                  {portalUrl}
                </a>
              </div>

              {/* Email preview */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Email Preview — edit before sending
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyEmailField('subject', emailSubject)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {emailCopied === 'subject' ? 'Copied' : 'Copy Subject'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyEmailField('body', emailBody)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {emailCopied === 'body' ? 'Copied' : 'Copy Body'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyEmailField('link', portalUrl)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {emailCopied === 'link' ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">To</label>
                  <input
                    type="email"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                    placeholder="client@example.com"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Message</label>
                  <textarea
                    rows={14}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                </div>
              </div>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
