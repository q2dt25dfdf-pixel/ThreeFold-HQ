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

// ── Push notification helpers ─────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buf = new ArrayBuffer(rawData.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

type PushStatusState = {
  checking: boolean
  isSecureCtx: boolean
  isPWA: boolean
  isIOS: boolean
  swSupported: boolean
  swReady: boolean
  pushSupported: boolean
  vapidKeyLoaded: boolean
  permission: string
  subscriptionExists: boolean
}

const PUSH_STATUS_INIT: PushStatusState = {
  checking: true, isSecureCtx: false, isPWA: false, isIOS: false,
  swSupported: false, swReady: false, pushSupported: false,
  vapidKeyLoaded: false, permission: 'default', subscriptionExists: false,
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
  const [pushResult, setPushResult] = useState<{
    configured: boolean
    subscriptionsFound: number
    attempted: number
    sent: number
    failed: number
    failures: { endpointHost: string; statusCode: number | null; message: string }[]
    skippedReason?: string
  } | null>(null)
  const [pushStatus, setPushStatus] = useState<PushStatusState>(PUSH_STATUS_INIT)
  const [pushEnabling, setPushEnabling] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [enableDebug, setEnableDebug] = useState<{
    endpointReceived: boolean
    authReceived: boolean
    p256dhReceived: boolean
    serviceRolePresent: boolean
    insertAttempted: boolean
    insertSucceeded: boolean
    exactError: string | null
  } | null>(null)

  const mountTime = useRef(new Date().toISOString())
  const seenIds = useRef<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)

  const { data: dbNotifications, loading, upsertItem, deleteItem, setData, reload } =
    useSupabaseTable<Notification>('notifications', [])

  useEffect(() => { setMounted(true) }, [])

  // ── Push notification status detection ────────────────────────────────────
  const checkPushStatus = async () => {
    const isSecureCtx = typeof window !== 'undefined' && window.isSecureContext
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    const swSupported = 'serviceWorker' in navigator
    const pushSupported = 'PushManager' in window
    const vapidKeyLoaded = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

    let swReady = false
    let subscriptionExists = false
    if (swSupported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/')
        if (reg?.active) {
          swReady = true
          try {
            const sub = await reg.pushManager.getSubscription()
            subscriptionExists = !!sub
          } catch { /* pushManager may not exist */ }
        }
      } catch { /* ignore */ }
    }

    const next: PushStatusState = {
      checking: false, isSecureCtx, isPWA, isIOS, swSupported, swReady,
      pushSupported, vapidKeyLoaded, permission, subscriptionExists,
    }
    console.log('[push-status]', next)
    setPushStatus(next)
  }

  useEffect(() => {
    checkPushStatus().catch(() => setPushStatus(s => ({ ...s, checking: false })))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const enablePushNotifications = async () => {
    setPushEnabling(true)
    setPushError(null)
    setEnableDebug(null)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushError('Permission not granted — enable notifications in browser settings.')
        setPushStatus(s => ({ ...s, permission }))
        return
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setPushError('VAPID public key not configured.'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      // sub.toJSON() is required — PushSubscription.keys is non-enumerable and
      // won't serialize via plain JSON.stringify, so auth/p256dh would be missing.
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>
      if (json.debug && typeof json.debug === 'object') {
        setEnableDebug(json.debug as typeof enableDebug extends null ? never : NonNullable<typeof enableDebug>)
      }
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : `Server error ${res.status}`)
      }
      // Update state directly — don't re-check local SW, which is true regardless of DB save
      setPushStatus(s => ({ ...s, permission: 'granted', subscriptionExists: true, swReady: true }))
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err))
    } finally {
      setPushEnabling(false)
    }
  }

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
    setPushResult(null)

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

      // Capture push result from server response
      if (json.push && typeof json.push === 'object') {
        setPushResult(json.push as typeof pushResult)
      }

      // DB insert confirmed — show locally and sync
      seenIds.current.add(id)
      setLocalNotifs(prev => [n, ...prev])
      setToasts(prev => [n, ...prev])
      bcRef.current?.postMessage({ type: 'new-notification', notification: n })
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

            {/* Panel footer */}
            <div style={{ borderTop: '1px solid #1e293b', padding: '14px 20px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* ── Phone Notifications ──────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Phone Notifications
                </p>
                {pushStatus.checking ? (
                  <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>Checking…</p>
                ) : (() => {
                  const { isPWA, isIOS, swSupported, pushSupported, vapidKeyLoaded, permission, subscriptionExists } = pushStatus
                  const canEnable = pushSupported && swSupported && vapidKeyLoaded && permission !== 'denied' && !(isIOS && !isPWA)
                  const isActive = permission === 'granted' && subscriptionExists

                  let statusText: string
                  let statusColor = '#64748b'
                  let showButton = false
                  let buttonLabel = 'Enable Phone Notifications'

                  if (!pushSupported || !swSupported || !vapidKeyLoaded) {
                    statusText = 'Phone notifications are unavailable.'
                  } else if (isIOS && !isPWA) {
                    statusText = 'Add to Home Screen to enable phone notifications.'
                    statusColor = '#f59e0b'
                  } else if (permission === 'denied') {
                    statusText = 'Phone notifications are blocked in Settings.'
                    statusColor = '#ef4444'
                  } else if (isActive) {
                    statusText = 'Phone notifications are active.'
                    statusColor = '#4ade80'
                  } else if (permission === 'granted' && !subscriptionExists) {
                    statusText = 'Notifications allowed, but this device is not subscribed yet.'
                    statusColor = '#f59e0b'
                    showButton = canEnable
                    buttonLabel = 'Subscribe This Device'
                  } else {
                    statusText = 'Phone notifications are ready to enable.'
                    showButton = canEnable
                  }

                  return (
                    <>
                      <p style={{ margin: 0, fontSize: '12px', color: statusColor, lineHeight: 1.5 }}>{statusText}</p>
                      {showButton && (
                        <button
                          type="button"
                          onClick={() => void enablePushNotifications()}
                          disabled={pushEnabling}
                          style={{
                            background: pushEnabling ? '#1e293b' : '#1d4ed8',
                            border: 'none', borderRadius: '10px', color: 'white',
                            fontSize: '12px', fontWeight: 700, cursor: pushEnabling ? 'default' : 'pointer',
                            padding: '8px 14px', textAlign: 'center', width: '100%',
                          }}
                        >
                          {pushEnabling ? 'Enabling…' : `🔔 ${buttonLabel}`}
                        </button>
                      )}
                      {pushError && (
                        <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', wordBreak: 'break-word' }}>{pushError}</p>
                      )}
                      {enableDebug && (
                        <div style={{ background: '#0f1e35', border: '1px solid #1e3a5c', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Subscribe debug</p>
                          {([
                            ['endpointReceived', 'Endpoint received'],
                            ['authReceived', 'Auth key received'],
                            ['p256dhReceived', 'p256dh key received'],
                            ['serviceRolePresent', 'Service role key set'],
                            ['insertAttempted', 'Insert attempted'],
                            ['insertSucceeded', 'Insert succeeded'],
                          ] as [keyof typeof enableDebug, string][]).map(([k, label]) => (
                            <p key={k} style={{ margin: 0, fontSize: '11px', color: enableDebug[k] ? '#4ade80' : '#ef4444' }}>
                              {enableDebug[k] ? '✓' : '✗'} {label}
                            </p>
                          ))}
                          {enableDebug.exactError && (
                            <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', wordBreak: 'break-word', marginTop: '2px' }}>
                              Error: {enableDebug.exactError}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* ── Test notification ────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #1e293b', paddingTop: '10px' }}>
                <button type="button" onClick={() => void sendTestNotification()} disabled={sending} style={{
                  background: 'none', border: 'none', color: sending ? '#334155' : '#475569',
                  fontSize: '12px', fontWeight: 500, cursor: sending ? 'default' : 'pointer',
                  padding: '6px 10px', borderRadius: '8px', letterSpacing: '0.02em', alignSelf: 'center',
                }}>
                  {sending ? 'Sending…' : '⚡ Send test notification'}
                </button>

                {testError && (
                  <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', textAlign: 'center' }}>
                    {testError}
                  </p>
                )}

                {pushResult && (
                  <div style={{ background: '#0f1e35', border: '1px solid #1e3a5c', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Push result</p>

                    {pushResult.skippedReason ? (
                      <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b' }}>⚠ Skipped: {pushResult.skippedReason}</p>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                          Subscriptions found: <span style={{ color: 'white', fontWeight: 600 }}>{pushResult.subscriptionsFound}</span>
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: pushResult.sent > 0 ? '#4ade80' : '#ef4444' }}>
                          {pushResult.sent > 0 ? `✓ Sent to ${pushResult.sent} device${pushResult.sent !== 1 ? 's' : ''}` : `✗ Sent: 0`}
                        </p>
                        {pushResult.failed > 0 && (
                          <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>✗ Failed: {pushResult.failed}</p>
                        )}
                        {pushResult.failures.map((f, i) => (
                          <p key={i} style={{ margin: 0, fontSize: '11px', color: '#ef4444', wordBreak: 'break-all' }}>
                            {f.endpointHost} — HTTP {f.statusCode ?? '?'}: {f.message}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
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
