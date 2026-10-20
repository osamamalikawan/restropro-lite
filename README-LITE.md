# Restro Pro Lite

A trimmed copy of Restro Pro: **POS, Sales, Menu, Expenses, Printer settings** (plus the notification bell).
It uses the same Supabase project as the full app and **changes nothing in the database**: there is no `supabase/` folder
here on purpose, so there is nothing to migrate. The super admin app keeps controlling subscriptions as before.

## What is different from the full app
Pages: Dashboard, POS, Sales, Menu, Expenses, Accounts, Notifications, Settings.
- Dashboard shows sales, average order, expenses and sales minus expenses, plus the sales charts and top products.
- Settings = Restaurant profile (name, address, phone, no service charge), the "Show item & category names in Urdu" switch,
  Payment methods (add, remove, drag to reorder) and this computer's printers.
- POS: item and category names, the kitchen slip and the invoice follow the Urdu switch (Urdu `name_ur`, English when missing).
  When it is on, the invoice labels (Subtotal, Delivery, Total) are Urdu too.
- POS: no tables, no order or item notes, no tax, no discount, no hold tickets, no customer search.
  Order types are Dine in / Takeaway / Delivery (delivery has name, phone, address and a delivery charge).
- There is no checkout popup: the order sidebar is the checkout. Each line has an editable quantity and unit price and a
  read-only total (qty x price). If a product name has a "( )" part, it is a description and the numbers inside it can be
  changed for that order (for example "Fries (250g)" -> "Fries (300g)"). The Copy icon on a line adds another line of the same
  product right under it with its own price (one plate at Rs 150 and one at Rs 200). Delivery charge and payment method are
  in the sidebar too.
- Kitchen print is drawn as one image: black "Kitchen Print" band, boxed order type, customer ("Walking Customer" by default), inverted order number with date and time, an Urdu item table (تعداد / آئٹم نام / رقم) with each line's amount, the cashier and total quantity (کل تعداد), and the total amount (کل رقم). See `app/pos` + `lib/posPrint.ts` (`renderKitchenSlip`).
- Sidebar buttons: **Save**, **Kitchen** (kitchen slip) and **Print** (kitchen slip + invoice). All three complete the order as fully paid. **Enter** = Kitchen print.
- Tax is forced to 0 on the server (`app/api/sales/route.ts` and `app/api/device/sales/route.ts`), whatever the full app's
  tax settings say.
- Removed: ticket rail, unpaid orders, riders, customers, inventory, restock, recipes, suppliers, ledgers, employees,
  attendance, permissions page, signup, cron jobs.

## Offline
- POS and Sales run from the PC's local database (as before).
- Dashboard, Menu, Expenses, Accounts, Settings and Notifications open offline with the last data the cloud sent.
  The desktop shell remembers every successful read and also pre-loads each screen in the background (about every 15 min).
- Changes made offline are queued and shown straight away: menu products and categories (add, edit, delete, reorder), expenses,
  expense categories, payment methods (add, remove, reorder), settings and marking notifications read. They upload, oldest
  first, as soon as the cloud answers again, as the cashier who made them. A change the server refuses is kept and shown
  in the sync status.
- Accounts shows income / expense / net for the date range and, instead of the ledger, one row per menu product with how many were sold and the amount (products with no sales show 0; there is a search box and a PDF button). Sales has a Receipt button that reprints an order's customer receipt.
- Dashboard and Accounts show the last synced numbers; they don't include expenses added offline until the next sync.
- Not available offline: uploading photos for menu items.
- This needs the matching shell change (`lite-shell-offline.patch` in the shell repo).

## Run / deploy
1. `npm install`
2. Copy the same environment variables as the full app (Supabase URL, publishable key, service role key, staff session secret).
3. Web: deploy as its own Vercel project. Desktop: `npm run build:desktop` (static export for the Tauri shell).
4. Restaurants, staff, PINs, menu, devices and subscriptions are all the existing ones. Create restaurants in the full signup /
   super admin, not here.

## Things to know
- Deals are created in the full app's Products page (this lite app has no deals editor). They show up in the POS under "Deals".
- Settings uses the `settings` permission, Accounts is admin/manager only, as in the full app.
- The Tauri/Rust shell is a separate repo and is unchanged. Its offline sales upload goes through `/api/device/sales`, so the
  desktop bundle must point at the lite deployment (or at any deployment that includes the zero-tax change).
