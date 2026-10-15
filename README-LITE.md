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
- Checkout is an editable receipt: quantity and unit price are editable, the line total is read-only (qty x price).
  If a product name has a "( )" part, it is treated as a description and the numbers inside it can be changed for that order
  (for example "Fries (250g)" -> "Fries (300g)"). Delivery charge is editable too.
- Kitchen print is drawn as one image: black "Kitchen Print" band, boxed order type, customer ("Walking Customer" by default), inverted order number with date and time, an Urdu item table (تعداد / آئٹم نام / رقم) with each line's amount, the cashier and total quantity (کل تعداد), and the total amount (کل رقم). See `app/pos` + `lib/posPrint.ts` (`renderKitchenSlip`).
- Checkout buttons: **Save**, **Kitchen print**, **Invoice print**. All three complete the order as fully paid.
- Tax is forced to 0 on the server (`app/api/sales/route.ts` and `app/api/device/sales/route.ts`), whatever the full app's
  tax settings say.
- Removed: ticket rail, unpaid orders, riders, customers, inventory, restock, recipes, suppliers, ledgers, employees,
  attendance, permissions page, signup, cron jobs.

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
