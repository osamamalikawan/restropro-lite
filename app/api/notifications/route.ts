import { NextResponse } from 'next/server'

import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";


export const dynamic = 'force-dynamic'

type Row = {
  id: string
  read_at: string | null
  read_by: string | null
  notifications: {
    id: string
    title: string
    body: string
    audience: string
    created_at: string
  } | null
}

/**
 * GET /api/notifications
 * Everyone in the tenant can read. Returns newest-first plus an unread count.
 */
export async function GET() {
  const session = await requireStaffSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('notification_recipients')
    .select(
      'id, read_at, read_by, notifications ( id, title, body, audience, created_at )'
    )
    .eq('restaurant_id', session.restaurantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  // Resolve "marked read by" names in one extra query (usually 0–1 ids).
  const readerIds = Array.from(new Set(rows.map((r) => r.read_by).filter(Boolean))) as string[]
  const names = new Map<string, string>()
  if (readerIds.length) {
    const { data: emps } = await admin
      .from('employees')
      .select('id, name')
      .in('id', readerIds)
    for (const e of emps ?? []) names.set(e.id as string, e.name as string)
  }

  const notifications = rows
    .filter((r) => r.notifications)
    .map((r) => ({
      recipientId: r.id,
      id: r.notifications!.id,
      title: r.notifications!.title,
      body: r.notifications!.body,
      audience: r.notifications!.audience,
      createdAt: r.notifications!.created_at,
      readAt: r.read_at,
      readBy: r.read_by ? names.get(r.read_by) ?? null : null,
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.readAt).length,
    canMarkRead: session.role === 'admin',
  })
}

/**
 * POST /api/notifications
 * Body: { action: 'markRead', recipientId } | { action: 'markAllRead' } | { action: 'markUnread', recipientId }
 * Admin only.
 */
export async function POST(req: Request) {
  const session = await requireStaffSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an admin can change notification read status.' },
      { status: 403 }
    )
  }

  const { action, recipientId } = await req.json().catch(() => ({} as any))

  const admin = createAdminClient()

  const base = admin
    .from('notification_recipients')
    .update(
      action === 'markUnread'
        ? { read_at: null, read_by: null }
        : { read_at: new Date().toISOString(), read_by: session.employeeId ?? null }
    )
    .eq('restaurant_id', session.restaurantId)

  let query
  if (action === 'markAllRead') {
    query = base.is('read_at', null)
  } else if (action === 'markRead' || action === 'markUnread') {
    if (!recipientId) {
      return NextResponse.json({ error: 'recipientId is required' }, { status: 400 })
    }
    query = base.eq('id', recipientId)
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
