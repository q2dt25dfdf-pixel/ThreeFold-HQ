'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Check, Loader2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSupabaseTable } from '@/lib/useSupabaseTable'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  entity_type: string
  entity_id: string
  created_at: string
  read: boolean
  read_at: string | null
}

const MAX_VISIBLE_TOASTS = 4
// Fallback poll interval — BroadcastChannel handles instant cross-tab;
// polling catches anything that slips through (e.g. different browsers, realtime gaps)
const NOTIF_POLL_MS = 12_000
// BroadcastChannel name — same-origin tabs share this channel
const BC_CHANNEL = 'threefold-hq-notifications'

function entityRoute(entity_type: string, entity_id: string): string | null {
  const routes: Record<string, string> = {
    order: `/orders/${entity_id}`,
    client: `/clients/${entity_id}`,
    finance: `/finances?invoice=${entity_id}`,
  }
  return entity_id ? (routes[entity_type] ?? null) : null
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationCenter() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [toasts, setToasts] = useState<Notification[]>([])
  // Client-side-only notifications (test button, BC-received, optimistic inserts)
  const [localNotifs, setLocalNotifs] = useState<Notification[]>([])
  const [sending, setSending] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const mountTime = useRef(new Date().toISOString())
  const seenIds = useRef<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)

  const { data: dbNotifications, loading, upsertItem, deleteItem, setData, reload } =
    useSupabaseTable<Notification>('notifications', [])

  useEffect(() => { setMounted(true) }, [])

  // Detect desktop breakpoint for toast sizing (mobile layout is not changed)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── BroadcastChannel — instant cross-tab sync within the same browser ──────
  // Receives notifications broadcast by other HQ tabs so they appear immediately
  // without waiting for the next poll cycle.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(BC_CHANNEL)
    bcRef.current = bc

    bc.onmessage = (event: MessageEvent) => {
      const msg = event.data as { type: string; notification?: Notification }
      if (msg.type !== 'new-notification' || !msg.notification) return
      const n = msg.notification
      // Guard: skip if this tab already has it (avoids double-toast on self-send)
      if (seenIds.current.has(n.id)) return
      seenIds.current.add(n.id)
      setLocalNotifs(prev => [n, ...prev])
      setToasts(prev => [n, ...prev])
      // Best-effort DB sync — replaces local copy if insert succeeded in originating tab
      reload().catch(() => {})
    }

    return () => {
      bc.close()
      bcRef.current = null
    }
  }, [reload])

  // ── 12-second polling fallback ────────────────────────────────────────────
  // Catches notifications from Stripe webhooks and other server-side paths that
  // don't go through BroadcastChannel (different browsers, cross-device, etc.)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload().catch(() => {})
    }, NOTIF_POLL_MS)
    return () => window.clearInterval(id)
  }, [reload])

  // ── Detect new DB-originated notifications ────────────────────────────────
  // Fires when DB data arrives (initial load, poll, or realtime event).
  // Queues toasts and broadcasts to all other open HQ tabs so they update
  // without waiting for their own poll cycle.
  useEffect(() => {
    dbNotifications.forEach(n => {
      if (seenIds.current.has(n.id)) return
      seenIds.current.add(n.id)
      if (n.created_at > mountTime.current) {
        setToasts(prev => [n, ...prev])
        // Broadcast to other open tabs (they may not have polled yet)
        bcRef.current?.postMessage({ type: 'new-notification', notification: n })
      }
    })
  }, [dbNotifications])

  // Drop local copies once the canonical DB version arrives
  useEffect(() => {
    const ids = new Set(dbNotifications.map(n => n.id))
    setLocalNotifs(prev => prev.filter(n => !ids.has(n.id)))
  }, [dbNotifications])

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [panelOpen])

  // Merged view: DB rows + local-only rows not yet in DB
  const dbIds = useMemo(() => new Set(dbNotifications.map(n => n.id)), [dbNotifications])
  const allNotifications = useMemo(
    () => [...dbNotifications, ...localNotifs.filter(n => !dbIds.has(n.id))],
    [dbNotifications, localNotifs, dbIds],
  )

  const unreadCount = allNotifications.filter(n => !n.read).length
  const sorted = [...allNotifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  // ── Mutation helpers ──────────────────────────────────────────────────────

  const markRead = async (n: Notification) => {
    if (n.read) return
    const updated = { ...n, read: true, read_at: new Date().toISOString() }
    if (dbIds.has(n.id)) {
      await upsertItem(updated)
    } else {
      setLocalNotifs(prev => prev.map(p => p.id === n.id ? updated : p))
    }
  }

  const markAllRead = async () => {
    if (unreadCount === 0) return
    const now = new Date().toISOString()
    setLocalNotifs(prev => prev.map(n => n.read ? n : { ...n, read: true, read_at: now }))
    if (dbNotifications.some(n => !n.read)) {
      await setData(dbNotifications.map(n => n.read ? n : { ...n, read: true, read_at: now }))
    }
  }

  // Dismiss = delete from DB (or remove from local state). Also clears any toast.
  const handleDismiss = async (n: Notification) => {
    setToasts(prev => prev.filter(t => t.id !== n.id))
    if (dbIds.has(n.id)) {
      await deleteItem(n.id)
    } else {
      setLocalNotifs(prev => prev.filter(p => p.id !== n.id))
    }
  }

  // Click notification body → mark read + navigate
  const handleNavigate = async (n: Notification) => {
    setPanelOpen(false)
    await markRead(n)
    const route = entityRoute(n.entity_type, n.entity_id)
    if (route) router.push(route)
  }

  // Toast click → dismiss + mark read + navigate
  const handleToastClick = async (n: Notification) => {
    setToasts(prev => prev.filter(t => t.id !== n.id))
    await markRead(n)
    const route = entityRoute(n.entity_type, n.entity_id)
    if (route) router.push(route)
  }

  // ── Test notification ─────────────────────────────────────────────────────
  // DB-first: insert to Supabase before showing locally so other devices
  // (mobile ↔ desktop) can pick it up through polling/realtime.
  // BroadcastChannel still fires for instant same-browser tab sync.

  const sendTestNotification = async () => {
    if (sending) return
    setSending(true)
    setTestError(null)

    const id = `notif-test-${Date.now()}`
    const n: Notification = {
      id,
      type: 'new_order',
      title: 'Test Notification',
      message: 'This is a test notification from ThreeFold HQ.',
      entity_type: '',
      entity_id: '',
      created_at: new Date().toISOString(),
      read: false,
      read_at: null,
    }

    try {
      const res = await fetch('/api/internal/test-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>

      if (!res.ok) {
        const msg = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`
        console.error('[test-notification] DB insert failed:', msg, json)
        setTestError(`Insert failed: ${msg}`)
        return
      }

      // DB insert confirmed — now show locally and sync
      seenIds.current.add(id)
      setLocalNotifs(prev => [n, ...prev])
      setToasts(prev => [n, ...prev])
      // Instant same-browser tab sync
      bcRef.current?.postMessage({ type: 'new-notification', notification: n })
      // Reload replaces local copy with canonical DB row
      reload().catch(err => console.error('[test-notification] reload error', err))

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[test-notification] fetch error', err)
      setTestError(`Network error: ${msg}`)
    } finally {
      setSending(false)
    }
  }

  if (!mounted) return null

  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS)
  const hiddenToastCount = toasts.length - visibleToasts.length

  // Desktop-only toast dimensions — mobile values are unchanged
  const toastWidth = isDesktop ? 'min(580px, calc(100vw - 5rem))' : 'min(480px, calc(100vw - 4rem))'
  const toastPad = isDesktop ? '18px 24px' : '14px 16px'
  const toastTitleSize = isDesktop ? '15px' : '13px'
  const toastMsgSize = isDesktop ? '13px' : '12px'
  const toastIconSize = isDesktop ? 36 : 28
  const toastCheckSize = isDesktop ? 16 : 14
  const toastShadow = isDesktop
    ? '0 16px 48px -8px rgba(0,0,0,0.24), 0 4px 16px -4px rgba(0,0,0,0.12)'
    : '0 8px 32px -4px rgba(0,0,0,0.18), 0 2px 8px -2px rgba(0,0,0,0.08)'

  return createPortal(
    <>
      <style>{`@keyframes notif-spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Bell + panel ─────────────────────────────────────────────── */}
      <div ref={panelRef} style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 60000 }}>

        {/* Bell button */}
        <button
          type="button"
          onClick={() => setPanelOpen(v => !v)}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '52px', height: '52px', borderRadius: '16px', background: '#0f172a',
            color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
        >
          <Bell size={24} />
          {unreadCount > 0 && (
            <span aria-hidden="true" style={{
              position: 'absolute', top: '8px', right: '8px', display: 'flex',
              alignItems: 'center', justifyContent: 'center', minWidth: '20px',
              height: '20px', padding: '0 5px', borderRadius: '9999px',
              background: '#ef4444', color: 'white', fontSize: '11px', fontWeight: 700, lineHeight: 1,
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Notification panel */}
        {panelOpen && (
          <div style={{
            position: 'fixed', top: '76px', right: '1rem',
            width: 'min(440px, calc(100vw - 2rem))', maxHeight: 'calc(100dvh - 96px)',
            background: '#0f172a', border: '1px solid #1e293b', borderRadius: '20px',
            boxShadow: '0 25px 60px -8px rgba(0,0,0,0.65)', display: 'flex',
            flexDirection: 'column', overflow: 'hidden', zIndex: 60001,
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #1e293b', flexShrink: 0,
            }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'white', letterSpacing: '0.01em' }}>
                Notifications
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {unreadCount > 0 && (
                  <button type="button" onClick={() => void markAllRead()} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
                    border: 'none', color: '#94a3b8', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', padding: '6px 10px', borderRadius: '8px',
                  }}>
                    <Check size={13} />
                    Mark all read
                  </button>
                )}
                <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px',
                  height: '32px', background: 'none', border: 'none', color: '#475569',
                  cursor: 'pointer', borderRadius: '8px',
                }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {loading && allNotifications.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: '#475569' }}>
                  <Loader2 size={22} style={{ animation: 'notif-spin 1s linear infinite' }} />
                </div>
              ) : sorted.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                  No notifications yet
                </div>
              ) : (
                <>
                  {unreadCount === 0 && (
                    <div style={{ padding: '10px 20px 6px', textAlign: 'center', color: '#334155', fontSize: '12px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      All caught up
                    </div>
                  )}
                  {sorted.map((n, i) => {
                    const route = entityRoute(n.entity_type, n.entity_id)
                    const isLast = i === sorted.length - 1
                    return (
                      <div key={n.id} style={{
                        display: 'flex', alignItems: 'stretch',
                        background: n.read ? 'transparent' : 'rgba(255,255,255,0.05)',
                        borderBottom: isLast ? 'none' : '1px solid #1e293b',
                      }}>
                        {/* Clickable content → navigate */}
                        <button
                          type="button"
                          onClick={() => void handleNavigate(n)}
                          disabled={!route}
                          title={route ? 'Open related record' : undefined}
                          style={{
                            flex: 1, minWidth: 0, padding: '16px 10px 16px 20px',
                            textAlign: 'left', background: 'none', border: 'none',
                            cursor: route ? 'pointer' : 'default',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            {!n.read && (
                              <span style={{
                                marginTop: '6px', flexShrink: 0, width: '8px', height: '8px',
                                borderRadius: '50%', background: '#f87171', display: 'block',
                              }} />
                            )}
                            <div style={{ minWidth: 0, paddingLeft: n.read ? '18px' : 0 }}>
                              <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'white', lineHeight: 1.3 }}>{n.title}</p>
                              <p style={{ margin: '5px 0 0', fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>{n.message}</p>
                              <p style={{ margin: '7px 0 0', fontSize: '12px', color: '#475569' }}>{timeAgo(n.created_at)}</p>
                            </div>
                          </div>
                        </button>

                        {/* Per-item actions: mark read + dismiss */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', padding: '10px 14px 10px 4px', flexShrink: 0 }}>
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => void markRead(n)}
                              title="Mark as read"
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '30px', height: '30px', borderRadius: '8px', background: 'none',
                                border: '1px solid #1e293b', color: '#475569', cursor: 'pointer',
                              }}
                            >
                              <Check size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDismiss(n)}
                            title="Dismiss"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '30px', height: '30px', borderRadius: '8px', background: 'none',
                              border: '1px solid #1e293b', color: '#475569', cursor: 'pointer',
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Panel footer — test button */}
            <div style={{ borderTop: '1px solid #1e293b', padding: '10px 20px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <button type="button" onClick={() => void sendTestNotification()} disabled={sending} style={{
                background: 'none', border: 'none', color: sending ? '#334155' : '#475569',
                fontSize: '12px', fontWeight: 500, cursor: sending ? 'default' : 'pointer',
                padding: '6px 10px', borderRadius: '8px', letterSpacing: '0.02em',
              }}>
                {sending ? 'Inserting to DB…' : '⚡ Send test notification'}
              </button>
              {testError && (
                <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', textAlign: 'center', maxWidth: '320px' }}>
                  {testError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast banners — top-center, max 4 visible ─────────────────── */}
      {/* Desktop: larger width, padding, font. Mobile: unchanged from approved design. */}
      {visibleToasts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '68px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 59999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: toastWidth,
          pointerEvents: 'none',
        }}>
          {hiddenToastCount > 0 && (
            <div
              onClick={() => setToasts([])}
              style={{
                padding: '8px 16px', background: '#1e293b', borderRadius: '12px',
                fontSize: '11px', fontWeight: 600, color: '#94a3b8', textAlign: 'center',
                pointerEvents: 'auto', cursor: 'pointer',
              }}
            >
              +{hiddenToastCount} more · dismiss all
            </div>
          )}
          {visibleToasts.map(t => {
            const route = entityRoute(t.entity_type, t.entity_id)
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: toastPad,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: '14px',
                boxShadow: toastShadow,
                pointerEvents: 'auto',
              }}>
                {/* Icon */}
                <div style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: `${toastIconSize}px`, height: `${toastIconSize}px`,
                  borderRadius: '50%', background: '#d1fae5',
                }}>
                  <Check size={toastCheckSize} style={{ color: '#059669' }} />
                </div>

                {/* Content */}
                <button
                  type="button"
                  onClick={() => void handleToastClick(t)}
                  disabled={!route}
                  style={{
                    flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
                    border: 'none', padding: 0, cursor: route ? 'pointer' : 'default',
                  }}
                >
                  <p style={{ margin: 0, fontSize: toastTitleSize, fontWeight: 700, color: '#0f172a' }}>{t.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: toastMsgSize, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.message}</p>
                </button>

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                  aria-label="Dismiss"
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', borderRadius: '8px', background: '#f1f5f9',
                    border: 'none', color: '#64748b', cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>,
    document.body,
  )
}
