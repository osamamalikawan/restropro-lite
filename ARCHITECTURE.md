# Restro Pro — Next.js + Supabase Architecture

## 1. Why this shape

Three different trust levels exist in this app, and they authenticate differently on purpose:

| Actor | Auth mechanism | Why |
|---|---|---|
| Super Admin | Supabase Auth (email/password), `is_super_admin` claim checked server-side | Rare, high-privilege, small number of people — full Supabase Auth (MFA-capable later) is worth it. |
| Restaurant owner | Supabase Auth (email/password), RLS-scoped to their own `restaurants` row | They need a real recoverable account (password reset emails, etc). |
| Restaurant staff (PIN login) | **Not** Supabase Auth. A short-lived, HMAC-signed, httpOnly cookie minted by a server route after checking a bcrypt PIN hash. | Staff share a till; a 4-digit PIN is a UX requirement, not a security posture. Giving every cashier a real Supabase Auth account (with email) doesn't match how the business operates, and PINs are guessable — so PIN "sessions" must never be able to talk to Supabase directly. All PIN-authenticated requests go through Next.js **server actions / API routes** that run with the Supabase **service-role** key and do the tenant check themselves. The client never gets a Supabase key for this path. |

## 2. Tenant lifecycle (matches your requirements exactly)

```
   SIGNUP                         SUPER ADMIN                    RESULT
┌───────────────┐            ┌─────────────────┐          ┌──────────────────┐
│ Restaurant     │            │ Sees new signup  │          │ restaurants.status│
│ fills signup   │───insert──▶│ in "Pending"     │──approve▶│  = 'active'       │
│ form:          │            │ queue            │          │                   │
│ - biz info     │            └─────────────────┘          │ employees row      │
│ - owner email/ │                                          │ created NOW using  │
│   password     │                                          │ the PIN they typed │
│ - admin name    │                                          │ at signup (hashed, │
│ - 4-digit PIN   │                                          │ stored pending)    │
└───────────────┘                                          └──────────────────┘
```

Key point you asked for explicitly: **the PIN is captured at signup but the admin's actual
`employees` row is only created at the moment Super Admin clicks Activate.** Until then:
- `restaurants.status = 'pending'`
- `restaurants.pending_admin_name` / `pending_admin_pin_hash` hold the not-yet-live admin
- No one can log into the restaurant app for that tenant (checked in `middleware.ts` and in
  `/api/staff/login`)

On activation (`app/super-admin/actions.ts::activateRestaurant`):
1. `restaurants.status → 'active'`, `activated_at = now()`
2. Insert `employees` row: `role='admin'`, `pin_hash = restaurants.pending_admin_pin_hash`
3. Clear the pending columns
4. Insert a `subscriptions` row (`status='trialing'` or `'active'` depending on the plan) with
   `current_period_end` and `grace_until = current_period_end + interval '3 days'`
5. Insert a welcome `notifications` row targeted at that one restaurant

## 3. Subscriptions & the 3-day grace period

`lib/subscription.ts` has one pure function, `computeStatus(sub)`, used in three places so the
logic can never drift:
- **Request-time enforcement** — `middleware.ts` calls it on every restaurant-app request.
- **Login-time enforcement** — `/api/staff/login` calls it before minting a session cookie.
- **Scheduled sweep** — `app/api/cron/check-subscriptions/route.ts`, hit by Vercel Cron, updates
  every subscription's stored `status` column so the Super Admin dashboard reflects reality even
  if nobody from that restaurant logs in (and so it can trigger a "you're in your grace period"
  notification once, not every request).

Status state machine:
```
active  --(now > current_period_end)-->  grace  --(now > grace_until)-->  expired
```
`grace` still allows login (with a banner) so a restaurant doesn't get locked out mid-shift over a
payment that's a day late. `expired` blocks the restaurant app entirely until Super Admin
reactivates or the owner pays and a new `subscriptions` row/period is recorded.

I set up the cron to run **daily** (not literally every 3 days) — a 3-day-only sweep would mean a
subscription could sit "active" in the dashboard for up to 3 days after actually lapsing, and
Super Admin wouldn't see it. Daily is the standard pattern for this; the *grace period itself* is
the 3 days you asked for, which is preserved exactly. Real-time enforcement in middleware means
the sweep is a display/notification convenience, not the only thing standing between a lapsed
account and continued access.

## 4. Local-first storage + Supabase sync

You asked for **local storage for speed** but Supabase as the source of truth. The design:

- **`lib/offline-db.ts`** — a tiny IndexedDB wrapper (works in all evergreen browsers, and unlike
  `localStorage` it's async and doesn't block the main thread on large tenants' data). Every
  syncable table gets a local object store keyed by `id`, plus every row carries `updated_at` and
  a soft `deleted_at`.
- **`lib/sync.ts`** — the sync engine:
  - **Read path**: pages read from IndexedDB first (instant paint, works offline), then kick off a
    background pull from Supabase and patch the UI when it resolves — this is what gives you the
    "fast loading" you asked for even before Supabase responds.
  - **Write path**: writes go to IndexedDB immediately (optimistic) and are pushed to a local
    `_outbox` store. A flush routine sends outbox entries to Supabase in order; on success they're
    removed from the outbox, on failure they stay queued and retry (on reconnect, on an interval,
    and on next app open).
  - **Conflict policy**: last-write-wins by `updated_at`. That's the right default for a
    single-till restaurant; if you later add multi-terminal simultaneous editing of the *same*
    record, you'd want per-field merge or a proper CRDT — flagged in the README as a known
    limitation, not silently glossed over.
  - **Pull path** also subscribes to **Supabase Realtime** on the tenant's tables so a second
    device (e.g. a manager's phone) sees changes within ~1s instead of waiting for the next poll.

This pattern is demonstrated end-to-end on the `employees` list in the restaurant dashboard
(`app/(restaurant)/dashboard/page.tsx`) as the reference implementation. Porting the rest of the
operational modules (POS, inventory, etc.) from the earlier HTML prototype onto this same
`offline-db` + `sync` pattern is mechanical repetition of this one pattern per table — flagged
clearly in the README as the next phase of work rather than silently left undone.

## 5. PWA

`public/manifest.json` + `public/sw.js` (registered in `app/layout.tsx`). Service worker strategy:
- App shell (JS/CSS/fonts): cache-first, versioned by build hash.
- API/Supabase calls: network-first with a short timeout falling back to cache — never blocks the
  local-first IndexedDB path described above, which already gives you instant reads regardless of
  the network.
- `manifest.json` declares `display: standalone` and maskable icons so it installs like a native
  app on the till/tablet.

## 6. What else a real multi-tenant SaaS needs (you asked me to flag this)

Not built in this pass, but worth budgeting for, roughly in the order I'd tackle them:

1. **Payments** — Stripe Billing (or Paddle) for the monthly/yearly subscriptions themselves;
   right now activation/plan changes are Super-Admin-manual. Stripe webhooks would drive
   `subscriptions` automatically instead.
2. **Transactional email** — Resend or Postmark for signup confirmation, activation notice,
   grace-period warnings, password reset (Supabase Auth can proxy this once you set an SMTP
   provider in the Supabase dashboard).
3. **Row-Level Security hardening** — the migration includes RLS policies for the owner-facing
   tables; get a second pair of eyes on these before going live, RLS bugs are the #1 way
   multi-tenant apps leak data between tenants.
4. **Rate limiting** — on `/api/staff/login` especially (4-digit PIN = 10,000 combinations; needs
   lockout after N attempts). Upstash Redis + `@upstash/ratelimit` is the common Vercel-native
   choice.
5. **Error tracking** — Sentry, wired into both the Next.js server and the service worker.
6. **Audit logging** — the schema includes `audit_logs`; wire every server action to write to it.
7. **Backups** — Supabase does automatic backups on paid tiers; confirm your plan covers this and
   test a restore before you need one for real.
8. **Staging environment** — a second Supabase project + Vercel preview env, so schema migrations
   get tested before hitting production data.
9. **CI** — GitHub Actions running `next build` + typecheck on every PR at minimum.
10. **Legal** — Terms of Service, Privacy Policy, and a data export/delete flow per restaurant
    (relevant once you have real customer PII in the `customers` table).
