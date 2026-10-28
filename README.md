# Restro Pro — Next.js + Supabase

Real production architecture (not a prototype): Next.js 14 App Router, Supabase (Postgres +
Auth), local-first IndexedDB cache with background sync, PWA. See **ARCHITECTURE.md** for the
full design rationale — read that first, it explains *why* things are built this way, especially
the two different auth systems (Supabase Auth for owners/super admin, HMAC-signed cookies for
staff PIN login) and the sync engine.

## What's implemented in this pass

- ✅ **Persistent app shell** — `app/(restaurant)/dashboard/layout.tsx` wraps every `/dashboard/*`
  page with a real sidebar (grouped nav with lucide-react icons, active-route highlighting,
  role-based item visibility) and topbar (restaurant name, live clock, signed-in user, logout).
  `/pos` is deliberately OUTSIDE this layout (full-screen, no sidebar chrome).
- ✅ **Fonts actually load now.** Fraunces/Public Sans/IBM Plex Mono were referenced in Tailwind
  config from the very first pass but never actually fetched (no `next/font` import, no Google
  Fonts `<link>`) — every heading was silently falling back to the browser's default serif/sans.
  Fixed via `next/font/google` in `app/layout.tsx`.
- ✅ **Real dark/light theme switching.** `app/globals.css` defines RGB-channel CSS variables
  (`--bg-canvas`, `--ink-strong`, etc.) for both themes, toggled via a `data-theme` attribute on
  `<html>` and persisted to `localStorage`. `tailwind.config.ts` maps them to token classes
  (`bg-canvas`, `text-ink-mid`, `border-line`, ...) using the `rgb(var(...) / <alpha-value>)`
  pattern specifically so opacity modifiers like `bg-raised/50` still work correctly. A mechanical
  sweep converted every hardcoded `bg-neutral-*`/`border-neutral-*`/`text-neutral-*` class across
  all 18 remaining pages to these tokens — `components/theme-toggle.tsx` (in the topbar, and on
  both login pages) actually switches the whole app now, not just a couple of screens.
- ✅ **Redesigned login pages** — both the staff login (`/login`) and Super Admin login now match
  the brand identity properly: mark + wordmark, warm radial background glow, Fraunces headings,
  themed form fields, theme toggle in the corner. The PIN pad also picked up the token system.

- ✅ Restaurant signup (owner email/password via Supabase Auth + admin name/PIN captured, tenant
  stays `pending`)
- ✅ Super Admin: email/password login, dashboard listing all restaurants with
  Activate/Suspend/Reactivate/Terminate
- ✅ **Activation flow does exactly what you asked**: only at Activate does the admin's
  `employees` row get created from the PIN captured at signup; before that, no one can log in
- ✅ One-time self-disabling bootstrap route to create your first Super Admin
- ✅ Subscriptions: monthly/yearly, 3-day grace period, enforced at login time (not just by the
  cron sweep) — `lib/subscription.ts` is the single source of truth for the status state machine
- ✅ Daily cron (`vercel.json`) that sweeps subscription status and fires a grace-period
  notification
- ✅ Notifications: Super Admin can send to all restaurants or a hand-picked subset
- ✅ Two-step staff login matching the old prototype: owner email+password resolves the tenant,
  then a real PIN pad (dot indicators + number grid, not a masked input) logs the staff member in
- ✅ Local-first storage: IndexedDB cache + optimistic writes + outbox + background sync,
  demonstrated on Employees (full read+write pattern) and Products (read path, used by POS for
  instant/offline menu loading)
- ✅ **POS**: product grid, cart, checkout with payment method, creates a real sale
- ✅ **Menu**: categories + products CRUD
- ✅ **Inventory**: item list with stock levels, add/remove
- ✅ **Recipes**: `/api/recipes` (link inventory items to a product, with automatic stock
  deduction on every sale) — the API is complete and POS checkout actually deducts stock through
  it, but there's **no UI page yet** to edit a recipe. Right now recipes can only be created by
  calling the API directly (e.g. via `curl`/Postman) until that editor screen is built.
- ✅ **Accounts**: ledger view + manual entries; sales post an income entry automatically
- ✅ **Suppliers**: list, add, remove
- ✅ **Restock**: log a purchase (item + supplier + qty + cost) — atomically adds to inventory
  stock, updates unit cost, and books an accounts expense entry
- ✅ **Settings**: real per-tenant tax rate + service charge rate + printer/receipt config —
  POS checkout now reads the actual tax rate here instead of a hardcoded constant
- ✅ **Tables & Delivery Areas**: manage both; POS now has a real Dine In / Takeaway / Delivery
  selector — Dine In requires picking a table, Delivery lets you pick an area (auto-fills its
  delivery fee, editable) — both flow through to the atomic `create_sale()` checkout
- ✅ **Recipe editor UI** — click "Recipe" on any product in Menu to link inventory items +
  quantities consumed per sale
- ✅ **Atomic checkout & restock** — `create_sale()` and `log_restock()` are real Postgres
  functions (`0003_atomic_ops_and_suppliers.sql`) called via `.rpc()`, so each one either fully
  commits or fully rolls back — no more partial-write risk from sequential JS calls
- ✅ **Customers**: 4-field model (name, phone unique per tenant, address, area), searchable.
  Integrated directly into POS checkout — search/select an existing customer or add a new one
  inline; if a typed phone matches an existing customer it's reused automatically (phone stays
  unique) rather than erroring or duplicating — this "find or create" happens atomically inside
  `create_sale()` itself, same transaction as the rest of checkout
- ✅ **Employee Ledger & Supplier Ledger**: log salary/advance/bonus/deduction or supplier
  payments — each logged payment atomically books a matching `accounts` expense entry via
  `log_employee_payment()` / `log_supplier_payment()` (same atomic-RPC pattern as checkout/restock)
- ✅ **Expenses**: regular/recurring, with vendor/description/payment method — atomically books a
  matching `accounts` entry via `log_expense()`
- ✅ **Users & Permissions**: add employees (name + role + PIN, hashed server-side), change role,
  activate/deactivate — plus a static reference table of what each of the 4 fixed roles can
  access (see the note below on why this isn't a dynamic per-action permission matrix)
- ✅ PWA manifest + service worker (app-shell caching)
- ✅ Full SQL migration with RLS policies (`0001_init.sql` → `0006_expenses.sql`)

## What's NOT in this pass (intentionally — see below for why)

- ❌ **Minor cosmetic redundancy from adding the shell after the fact**: most individual dashboard
  pages still have a "← Dashboard" text link in their own header, now redundant with the sidebar.
  Not broken — just a link nobody needs anymore. Cheap cleanup, just hasn't been done.
- ❌ **The `<main>` wrapper on each page still sets its own `min-h-screen`/padding** — harmless
  (nested inside the layout's own full-height flex container, doesn't visually break anything)
  but slightly redundant markup that could be trimmed.

- ❌ **Permissions are 4 fixed roles with hardcoded allow-lists per API route**, not a dynamic
  per-action permission matrix (the kind where you'd tick individual "can edit inventory" boxes
  per role). That's a deliberate scope decision — a fine-grained system is real additional work
  and the 4 roles cover the common cases. The Users & Permissions page documents current access
  as a static reference table rather than pretending it's configurable.
- ❌ **Recipe editor UI is done**, but no product currently ships with a default recipe — you have
  to link ingredients manually per product.
- ❌ **Dine-in service charge isn't applied at checkout yet.** `restaurant_settings.service_charge_rate`
  exists and is editable, but `create_sale()` doesn't add it to the total for Dine In orders —
  that's a small follow-up to the `create_sale()` function + POS client's total calculation.
- ❌ Payment processing (Stripe/Paddle) — plan changes and activation are Super-Admin-manual right
  now. See ARCHITECTURE.md §6.
- ❌ Real PWA icons — `public/manifest.json` references `/icons/icon-*.png` that don't exist yet;
  generate real ones (e.g. via https://realfavicongenerator.net) and drop them in `public/icons/`.
- ❌ Rate limiting on the PIN login route — a 4-digit PIN is brute-forceable without it. Don't go
  live without adding this (Upstash + `@upstash/ratelimit` is the easiest Vercel-native option).
- ❌ Transactional email (signup confirmation, activation notice, password reset UI)
- ❌ Automated tests

## Setup

### 1. Supabase project
1. Create a project at supabase.com.
2. Project Settings → API: copy the URL and publishable key into `.env.local` (copy
   `.env.example` first).
3. Project Settings → API → service_role key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
   commit this or prefix it with `NEXT_PUBLIC_`).
4. SQL Editor → paste and run `supabase/migrations/0001_init.sql`, then run
   `supabase/migrations/0002_operations.sql` (menu, inventory, recipes, sales, accounts), then
   `supabase/migrations/0003_atomic_ops_and_suppliers.sql` (atomic checkout/restock functions,
   suppliers, restock history), then `supabase/migrations/0004_settings_tables_delivery.sql`
   (per-tenant settings, tables, delivery areas — and extends `create_sale()` to use them), then
   `supabase/migrations/0005_customers_ledgers.sql` (customers, employee/supplier ledgers, and
   extends `create_sale()` again to link/auto-create a customer), then
   `supabase/migrations/0006_expenses.sql` (expenses + `log_expense()`).

### 2. Environment variables
Copy `.env.example` to `.env.local` and fill in every value, including two random secrets you
generate yourself:
```bash
openssl rand -base64 48   # STAFF_SESSION_SECRET
openssl rand -base64 32   # CRON_SECRET and BOOTSTRAP_SECRET
```

### 3. Install & run
```bash
npm install
npm run dev
```

### 4. Create your first Super Admin (once)
```bash
curl -X POST http://localhost:3000/api/super-admin/bootstrap \
  -H "content-type: application/json" \
  -d '{"email":"admin@restropro.com","password":"a-real-password","bootstrapSecret":"YOUR_BOOTSTRAP_SECRET"}'
```
This route 403s forever once a super admin exists — safe to leave deployed.

### 5. Try the flow
1. Visit `/signup`, create a restaurant (note the restaurant name you pick).
2. Visit `/super-admin/login`, sign in as the super admin you just bootstrapped.
3. `/super-admin/dashboard` → Activate the new restaurant.
4. Supabase Table Editor → `restaurants` → copy the `slug` of the row you just activated.
5. Visit `/login`, enter that slug + the 4-digit PIN you signed up with → lands on `/dashboard`.

## Deploying to Vercel

1. Push this to a GitHub repo, import it in Vercel.
2. Add every `.env.local` variable to the Vercel project's Environment Variables.
3. Vercel Cron (the `vercel.json` in this repo) picks up automatically on deploy — no extra
   config needed, it just needs `CRON_SECRET` set in the environment.
4. Re-run the bootstrap curl command against your production URL once, then treat that endpoint
   as permanently retired.

## Extending this further

Every module from the original prototype is now ported except the two items called out above
(a dynamic permissions matrix, and Stripe-driven billing) plus the smaller loose ends also listed
there (dine-in service charge, real PWA icons, rate limiting, transactional email, tests). For any
new module, the established pattern is:
1. Add the table(s) to a new file in `supabase/migrations/` (`id`, `restaurant_id`, RLS enabled
   with only a super-admin-read policy — see ARCHITECTURE.md for why).
2. Add an `app/api/<module>/route.ts` following `app/api/inventory/route.ts` as the template
   (GET list scoped by `requireStaffSession()`'s `restaurantId`, POST for insert/update/delete).
3. Build a page + client component the same shape as `app/(restaurant)/dashboard/menu/`.
4. If the operation touches money or stock in more than one table, write it as a single Postgres
   function called via `.rpc()` (see `create_sale()`, `log_restock()`, `log_expense()`) — not
   sequential JS calls.
5. Only wire something into the local-first sync engine (`lib/offline-db.ts` + `lib/sync.ts`) if
   it's genuinely high-frequency/needs-to-work-offline, like POS's product list. Back-office CRUD
   screens intentionally just `fetch()` on mount.
