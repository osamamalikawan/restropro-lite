import { createAdminClient } from "@/lib/supabase/admin";

/** No longer a fixed union — a role is now whatever's in the `roles` table for this tenant
 *  (the 4 system ones, lazily seeded, plus any admin-created custom ones). Kept as a named
 *  type alias rather than inlining `string` everywhere so the intent stays clear at each
 *  call site. */
export type Role = string;
export const SYSTEM_ROLES = ["admin", "manager", "cashier", "inventory"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Matches nav-config.ts's NavItem.perm values 1:1, and the DB check constraint on
 *  role_permissions.module. "pos" also gates Ticket Rail, "sales" also gates Unpaid Orders,
 *  and "settings" also gates Payment Methods — same doubling-up the prototype's own
 *  data-perm attributes use. */
export const PERMISSION_MODULES = [
  "dashboard", "pos", "sales", "customers", "inventory", "restock", "products", "recipes",
  "suppliers", "supplierLedger", "employees", "employeeLedger", "accounts", "expenses",
  "menu", "tables", "settings", "admin",
] as const;
export type PermModule = (typeof PERMISSION_MODULES)[number];

/** Default view-access-by-role, ported from the prototype's seeded permission matrix
 *  (scripts/data/seed-data.js — ADMIN/MANAGER/CASHIER/INVENTORY_PERMS). Used purely to seed
 *  a tenant's role_permissions rows the first time anyone reads them — after that, whatever
 *  is in the table (as edited on the Users & Permissions page) is the source of truth. A
 *  custom role has no entry here, which defaultRows() below treats as "starts with zero
 *  access until Admin configures it in the matrix" — a deliberately safe default for a
 *  freshly-created role rather than guessing what it should be able to see. */
const DEFAULTS: Record<SystemRole, PermModule[] | "all"> = {
  admin: "all",
  manager: [
    "dashboard", "pos", "sales", "customers", "inventory", "restock", "suppliers",
    "supplierLedger", "employees", "employeeLedger", "accounts", "expenses", "menu", "tables",
  ],
  cashier: ["dashboard", "pos", "sales", "customers", "tables"],
  inventory: ["dashboard", "inventory", "restock", "suppliers"],
};

/** Lists this tenant's roles, lazily seeding the 4 system roles on first read (same
 *  lazy-create-on-read pattern used throughout this codebase — see /api/settings). System
 *  roles are protected from rename/delete at the /api/roles layer via `is_system`. */
export async function listRoles(restaurantId: string): Promise<{ id: string; name: string; is_system: boolean }[]> {
  const admin = createAdminClient();
  let { data } = await admin.from("roles").select("id, name, is_system").eq("restaurant_id", restaurantId).order("is_system", { ascending: false }).order("name");

  if (!data || data.length === 0) {
    const { data: created, error } = await admin
      .from("roles")
      .insert(SYSTEM_ROLES.map((name) => ({ restaurant_id: restaurantId, name, is_system: true })))
      .select("id, name, is_system");
    if (!error) data = created;
  }
  return data ?? [];
}

function defaultRows(restaurantId: string, roleNames: string[]) {
  const rows: { restaurant_id: string; role: string; module: PermModule; can_view: boolean }[] = [];
  for (const role of roleNames) {
    const allowed = DEFAULTS[role as SystemRole] ?? [];
    for (const module of PERMISSION_MODULES) {
      rows.push({ restaurant_id: restaurantId, role, module, can_view: allowed === "all" || allowed.includes(module) });
    }
  }
  return rows;
}

/** Full role×module matrix for a tenant, seeding default rows for any role that doesn't
 *  have them yet (covers both "brand new tenant, nothing seeded" and "a custom role was
 *  just created after the table already had other roles' rows" — see getModuleAccess for
 *  why seeding used to be all-or-nothing and could silently fail for the second case).
 *  Used by the Users & Permissions page to render/edit the whole grid. */
export async function getPermissionMatrix(restaurantId: string): Promise<Record<string, Record<PermModule, boolean>>> {
  const admin = createAdminClient();
  const roles = await listRoles(restaurantId);
  const roleNames = roles.map((r) => r.name);

  const { data } = await admin.from("role_permissions").select("role, module, can_view").eq("restaurant_id", restaurantId);

  const seenRoles = new Set((data ?? []).map((r) => r.role));
  const missingRoles = roleNames.filter((r) => !seenRoles.has(r));
  let rows = data ?? [];
  if (missingRoles.length > 0) {
    const toInsert = defaultRows(restaurantId, missingRoles);
    const { error } = await admin.from("role_permissions").insert(toInsert);
    if (!error) rows = [...rows, ...toInsert];
  }

  const matrix = Object.fromEntries(
    roleNames.map((role) => [role, Object.fromEntries(PERMISSION_MODULES.map((m) => [m, false]))])
  ) as Record<string, Record<PermModule, boolean>>;
  for (const row of rows) {
    if (matrix[row.role]) matrix[row.role][row.module as PermModule] = row.can_view;
  }
  if (matrix.admin) matrix.admin = Object.fromEntries(PERMISSION_MODULES.map((m) => [m, true])) as Record<PermModule, boolean>;
  return matrix;
}

/** Just the current employee's own accessible modules — what the dashboard layout/sidebar
 *  and per-page guards actually need on every request, without pulling the full role×module
 *  grid. Seeds only THIS role's rows if missing (not every role's — the old version tried to
 *  insert defaults for every known role whenever any one role's rows were absent, which hit
 *  a primary-key conflict — and therefore silently failed to seed anything — the moment a
 *  second role already had rows in the table). */
export async function getModuleAccess(restaurantId: string, role: Role): Promise<Record<PermModule, boolean>> {
  if (role === "admin") {
    return Object.fromEntries(PERMISSION_MODULES.map((m) => [m, true])) as Record<PermModule, boolean>;
  }
  const admin = createAdminClient();
  let { data } = await admin
    .from("role_permissions")
    .select("module, can_view")
    .eq("restaurant_id", restaurantId)
    .eq("role", role);

  if (!data || data.length === 0) {
    const rows = defaultRows(restaurantId, [role]);
    const { error } = await admin.from("role_permissions").insert(rows);
    if (!error) data = rows;
  }

  const access = Object.fromEntries(PERMISSION_MODULES.map((m) => [m, false])) as Record<PermModule, boolean>;
  for (const row of data ?? []) access[row.module as PermModule] = row.can_view;
  return access;
}

/** One-off check for a server-component page guard (e.g. "can this role open /dashboard/products?").
 *  Cheap wrapper around getModuleAccess for pages that don't otherwise need the full context. */
export async function hasModuleAccess(restaurantId: string, role: Role, module: PermModule): Promise<boolean> {
  if (role === "admin") return true;
  const access = await getModuleAccess(restaurantId, role);
  return !!access[module];
}

/** Toggles one role×module cell — the whole write path behind the Users & Permissions
 *  matrix. Module-level toggle sets a single can_view flag, same simplification the
 *  prototype's UI makes (it flips a whole CRUD-permission object per module; this schema
 *  only tracks view access per module, which is what actually gates navigation/pages here). */
export async function setModuleAccess(restaurantId: string, role: Role, module: PermModule, canView: boolean) {
  if (role === "admin") return; // Admin's row is always all-true and not editable, same as the prototype.
  const admin = createAdminClient();
  return admin
    .from("role_permissions")
    .upsert({ restaurant_id: restaurantId, role, module, can_view: canView, updated_at: new Date().toISOString() });
}
