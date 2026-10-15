'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Check, CheckCheck, RotateCcw } from 'lucide-react'

type Notification = {
  recipientId: string
  id: string
  title: string
  body: string
  audience: string
  createdAt: string
  readAt: string | null
  readBy: string | null
}

function when(iso: string) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Topbar bell. Click opens an inline popup with the recent notifications
 * (no navigation). Polls the unread count every 60s and on tab refocus;
 * fetches the full list only when the popup is opened.
 */
const PANEL_WIDTH = 352 // px — matches w-[22rem] below
const VIEWPORT_MARGIN = 12 // px — never sit flush against the screen edge

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [canMarkRead, setCanMarkRead] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const loadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setUnread(json.unreadCount ?? 0)
    } catch {
      /* offline — keep the last known count */
    }
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load notifications')
      setItems(json.notifications ?? [])
      setCanMarkRead(Boolean(json.canMarkRead))
      setUnread(json.unreadCount ?? 0)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Background unread-count polling, independent of the popup being open.
  useEffect(() => {
    loadCount()
    const interval = setInterval(loadCount, 60_000)
    window.addEventListener('focus', loadCount)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', loadCount)
    }
  }, [loadCount])

  // Fetch the full list the moment the popup opens.
  useEffect(() => {
    if (open) loadList()
  }, [open, loadList])

  // Position the panel from the button's real on-screen rect, clamped so it can
  // never land outside the viewport regardless of where the bell sits in the
  // page layout or whether the page has any horizontal overflow elsewhere.
  useEffect(() => {
    if (!open) return

    function place() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      // Distance from the viewport's right edge to the button's right edge —
      // this is what right-aligns the panel to the bell.
      let right = window.innerWidth - rect.right
      // Clamp so the panel's left edge never goes past the viewport's left
      // margin (covers narrow screens / the bell sitting near the left).
      const maxRight = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN
      if (right > maxRight) right = maxRight
      // Clamp so it never sits past the right edge either.
      if (right < VIEWPORT_MARGIN) right = VIEWPORT_MARGIN
      setPanelPos({ top: rect.bottom + 8, right })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function act(action: string, recipientId?: string) {
    setBusy(recipientId ?? action)
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, recipientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      await loadList()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-mid transition hover:bg-raised hover:text-ink-strong"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && panelPos && (
        <div
          style={{ position: 'fixed', top: panelPos.top, right: panelPos.right }}
          className="z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-surface shadow-lg"
        >

          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-strong">Notifications</h2>
              <p className="text-xs text-ink-mid">
                {loading ? 'Loading…' : unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
            {canMarkRead && unread > 0 && (
              <button
                onClick={() => act('markAllRead')}
                disabled={busy === 'markAllRead'}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-strong transition hover:bg-raised disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {error && (
            <p className="mx-4 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
              {error}
            </p>
          )}

          <div className="max-h-96 overflow-y-auto p-2">
            {!loading && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff className="h-5 w-5 text-ink-mid" />
                <p className="text-sm text-ink-mid">No notifications yet.</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {items.map((n) => (
                  <li
                    key={n.recipientId}
                    className={`rounded-lg border p-3 transition ${
                      n.readAt ? 'border-line bg-raised/30' : 'border-line bg-raised'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                          <h3
                            className={`truncate text-sm ${
                              n.readAt ? 'text-ink-mid' : 'font-semibold text-ink-strong'
                            }`}
                          >
                            {n.title}
                          </h3>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-ink-mid">{n.body}</p>
                        <p className="mt-1.5 text-[11px] text-ink-mid/70">
                          {when(n.createdAt)}
                          {n.readAt && ` · read${n.readBy ? ` by ${n.readBy}` : ''}`}
                        </p>
                      </div>

                      {canMarkRead && (
                        <button
                          onClick={() => act(n.readAt ? 'markUnread' : 'markRead', n.recipientId)}
                          disabled={busy === n.recipientId}
                          title={n.readAt ? 'Mark as unread' : 'Mark as read'}
                          className="shrink-0 rounded-lg border border-line p-1.5 text-ink-mid transition hover:bg-canvas hover:text-ink-strong disabled:opacity-50"
                        >
                          {n.readAt ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-ink-mid hover:text-ink-strong"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
