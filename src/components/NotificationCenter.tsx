'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, Check, X } from 'lucide-react'
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [toasts, setToasts] = useState<Notification[]>([])

  // ISO timestamp of component mount — used to distinguish pre-existing vs genuinely new notifications
  const mountTime = useRef(new Date().toISOString())
  const seenIds = useRef<Set<string>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  const { data: notifications, upsertItem, setData } = useSupabaseTable<Notification>('notifications', [])

  useEffect(() => { setMounted(true) }, [])

  // Detect new notifications and queue them as toasts
  useEffect(() => {
    notifications.forEach(n => {
      if (seenIds.current.has(n.id)) return
      seenIds.current.add(n.id)
      // Only toast notifications created after this tab opened
      if (n.created_at > mountTime.current) {
        setToasts(prev => [n, ...prev])
      }
    })
  }, [notifications])

  // Close panel when clicking outside
  useEffect(() => {
    if (!panelOpen) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  const unreadCount = notifications.filter(n => !n.read).length
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const markAllRead = async () => {
    if (unreadCount === 0) return
    const now = new Date().toISOString()
    await setData(notifications.map(n => n.read ? n : { ...n, read: true, read_at: now }))
  }

  const handlePanelItemClick = async (n: Notification) => {
    setPanelOpen(false)
    if (!n.read) {
      await upsertItem({ ...n, read: true, read_at: new Date().toISOString() })
    }
    const route = entityRoute(n.entity_type, n.entity_id)
    if (route) router.push(route)
  }

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const handleToastClick = async (n: Notification) => {
    dismissToast(n.id)
    if (!n.read) {
      await upsertItem({ ...n, read: true, read_at: new Date().toISOString() })
    }
    const route = entityRoute(n.entity_type, n.entity_id)
    if (route) router.push(route)
  }

  if (!mounted) return null

  return createPortal(
    <>
      {/* ── Bell + panel ─────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 60000 }}
      >
        {/* Bell button */}
        <button
          type="button"
          onClick={() => setPanelOpen(v => !v)}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: '#0f172a',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '16px',
                height: '16px',
                padding: '0 3px',
                borderRadius: '9999px',
                background: '#ef4444',
                color: 'white',
                fontSize: '9px',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {panelOpen && (
          <div
            style={{
              position: 'absolute',
              top: '48px',
              right: 0,
              width: '320px',
              maxWidth: 'calc(100vw - 2rem)',
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'white', letterSpacing: '0.01em' }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '8px',
                  }}
                >
                  <Check size={11} />
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {sorted.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#475569', fontSize: '13px' }}>
                  No notifications yet
                </div>
              ) : (
                sorted.map((n, i) => {
                  const route = entityRoute(n.entity_type, n.entity_id)
                  const isLast = i === sorted.length - 1
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handlePanelItemClick(n)}
                      disabled={!route}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '12px 16px',
                        textAlign: 'left',
                        background: n.read ? 'transparent' : 'rgba(255,255,255,0.04)',
                        border: 'none',
                        borderBottom: isLast ? 'none' : '1px solid #1e293b',
                        cursor: route ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        {!n.read && (
                          <span
                            style={{
                              marginTop: '5px',
                              flexShrink: 0,
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: '#f87171',
                              display: 'block',
                            }}
                          />
                        )}
                        <div style={{ minWidth: 0, paddingLeft: n.read ? '14px' : 0 }}>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'white' }}>
                            {n.title}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.message}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#475569' }}>
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast stack ───────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '64px',
            right: '1rem',
            zIndex: 59999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            width: '320px',
            maxWidth: 'calc(100vw - 2rem)',
            pointerEvents: 'none',
          }}
        >
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px 16px',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.05)',
                pointerEvents: 'auto',
              }}
            >
              {/* Icon */}
              <div
                style={{
                  marginTop: '1px',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#d1fae5',
                }}
              >
                <Check size={13} style={{ color: '#059669' }} />
              </div>

              {/* Content */}
              <button
                type="button"
                onClick={() => void handleToastClick(t)}
                disabled={!entityRoute(t.entity_type, t.entity_id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: entityRoute(t.entity_type, t.entity_id) ? 'pointer' : 'default',
                }}
              >
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  {t.title}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.message}
                </p>
              </button>

              {/* Dismiss */}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>,
    document.body
  )
}
