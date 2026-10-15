'use client'

import { useCallback, useEffect, useState } from 'react'
import { BellOff, Check, CheckCheck, RotateCcw } from 'lucide-react'

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

export default function NotificationsClient() {
  const [items, setItems] = useState<Notification[]>([])
  const [canMarkRead, setCanMarkRead] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load notifications')
      setItems(json.notifications ?? [])
      setCanMarkRead(Boolean(json.canMarkRead))
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const unread = items.filter((n) => !n.readAt).length

  if (loading) return <p className="text-sm text-ink-mid">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-mid">
          {unread > 0 ? `${unread} unread` : 'All caught up'} · {items.length} total
        </p>
        {canMarkRead && unread > 0 && (
          <button
            onClick={() => act('markAllRead')}
            disabled={busy === 'markAllRead'}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-strong transition hover:bg-raised disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {!canMarkRead && items.length > 0 && (
        <p className="text-xs text-ink-mid">
          Only an admin can mark notifications as read.
        </p>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-raised/40 p-10 text-center">
          <BellOff className="h-6 w-6 text-ink-mid" />
          <p className="text-sm text-ink-mid">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.recipientId}
              className={`rounded-xl border p-4 transition ${
                n.readAt ? 'border-line bg-raised/30' : 'border-line bg-raised'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <h2
                      className={`truncate text-sm ${
                        n.readAt ? 'text-ink-mid' : 'font-semibold text-ink-strong'
                      }`}
                    >
                      {n.title}
                    </h2>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-mid">{n.body}</p>
                  <p className="mt-2 text-xs text-ink-mid/70">
                    {when(n.createdAt)}
                    {n.readAt && ` · read${n.readBy ? ` by ${n.readBy}` : ''}`}
                  </p>
                </div>

                {canMarkRead && (
                  <button
                    onClick={() =>
                      act(n.readAt ? 'markUnread' : 'markRead', n.recipientId)
                    }
                    disabled={busy === n.recipientId}
                    title={n.readAt ? 'Mark as unread' : 'Mark as read'}
                    className="shrink-0 rounded-lg border border-line p-2 text-ink-mid transition hover:bg-canvas hover:text-ink-strong disabled:opacity-50"
                  >
                    {n.readAt ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
