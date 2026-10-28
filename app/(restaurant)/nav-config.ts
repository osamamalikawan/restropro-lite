import { LayoutDashboard, ShoppingCart, TrendingUp, UtensilsCrossed, CreditCard, DollarSign, Bell, Settings, type LucideIcon } from "lucide-react";

export type Role = string;

/** Sidebar nav modules, ordered/grouped exactly like the prototype's #sidebar. `perm` is the
 *  permission-module key that gates visibility (see ROLE_MODULES below) — matches the
 *  prototype's `data-perm` attribute 1:1, including the two views that intentionally reuse
 *  another module's permission (Ticket Rail rides on "pos", Unpaid Orders and Payment
 *  Methods ride on "sales" and "settings" respectively). */
export type NavItem = { href: string; label: string; icon: LucideIcon; perm: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" },
      { href: "/pos", label: "Point of Sale", icon: ShoppingCart, perm: "pos" },
      { href: "/sales", label: "Sales", icon: TrendingUp, perm: "sales" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/menu", label: "Menu", icon: UtensilsCrossed, perm: "menu" },
      { href: "/expenses", label: "Expenses", icon: CreditCard, perm: "expenses" },
      { href: "/accounts", label: "Accounts", icon: DollarSign, perm: "accounts" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell, perm: "Notifications" },
      { href: "/settings", label: "Settings", icon: Settings, perm: "settings" },
    ],
  },
];

/**
 * View access is now per-tenant and editable (Users & Permissions page) — see
 * lib/permissions.ts, which owns the defaults and the DB read/write. This file only keeps
 * the static bits (labels, icons, routes, titles) plus a small pure helper for checking a
 * resolved module-access map, since that's still needed in three places (Sidebar filtering,
 * page-level guards, and the topbar) and shouldn't be reimplemented three times.
 */
export function canAccess(role: string, modulePerms: Record<string, boolean> | undefined, perm: string): boolean {
  if (role === "admin") return true;
  return !!modulePerms?.[perm];
}

/** Per-page title + subtitle for the topbar, matching the prototype's RESTAURANT_VIEW_META
 *  (scripts/app.js) — keyed by the dashboard sub-path (matched by longest-prefix in
 *  getPageMeta below, so nested/profile routes still resolve to their parent section). */
export const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Live overview of today's service" },
  "/pos": { title: "Point of Sale", subtitle: "Take orders and print the bill" },
  "/sales": { title: "Sales", subtitle: "Full order history" },
  "/menu": { title: "Menu", subtitle: "Categories and product cards shown in POS" },
  "/expenses": { title: "Expenses", subtitle: "Regular and recurring restaurant expenses" },
  "/accounts": { title: "Accounts", subtitle: "Income & expense ledger" },
  "/notifications": { title: "Notifications", subtitle: "Messages from the Restro Pro team" },
  "/settings": { title: "Settings", subtitle: "Restaurant profile, Urdu names, payment methods and printers" },
};

/** Longest-prefix match so a nested/profile route (e.g. /customers/[id]) still
 *  picks up its section's title instead of falling back to the bare Dashboard default. */
export function getPageMeta(pathname: string): { title: string; subtitle: string } {
  let best: { title: string; subtitle: string } | null = null;
  let bestLen = -1;
  for (const [prefix, meta] of Object.entries(VIEW_META)) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > bestLen) {
      best = meta;
      bestLen = prefix.length;
    }
  }
  return best ?? VIEW_META["/dashboard"];
}
