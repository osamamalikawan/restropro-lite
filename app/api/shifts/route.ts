import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { isMissingShiftTable, MIGRATION_WARNING } from "@/lib/shifts";

const COLUMNS =
  "id, employee_id, employee_name, clock_in_at, clock_out_at, status, duration_minutes, orders_count, sales_amount, cash_amount, other_amount, other_breakdown, unpaid_amount, expenses_amount";

/** Shift records, newest first, paged like the other lists: ?limit (default 50, max 200) &offset,
 *  ?q= (employee name), ?from= & ?to= (ISO instants, filter on clock-in time), ?status=open|closed|abandoned.
 *  Returns { shifts, hasMore }; the first page (offset 0) also returns { totals } for the whole filtered range. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  if (!(await hasModuleAccess(session.restaurantId, session.role, "employees"))) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const iso = (v: string | null) => (v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
  const from = iso(sp.get("from"));
  const to = iso(sp.get("to"));
  const status = sp.get("status");

  const build = (columns: string) => {
    let query = admin.from("staff_shifts").select(columns).eq("restaurant_id", session.restaurantId);
    if (q) query = query.ilike("employee_name", `%${q}%`);
    if (from) query = query.gte("clock_in_at", from);
    if (to) query = query.lte("clock_in_at", to);
    if (status && ["open", "closed", "abandoned"].includes(status)) query = query.eq("status", status);
    return query;
  };

  const { data, error } = await build(COLUMNS).order("clock_in_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
  if (error) {
    return NextResponse.json({ error: isMissingShiftTable(error) ? MIGRATION_WARNING : error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const body: Record<string, unknown> = { shifts: rows.slice(0, limit), hasMore: rows.length > limit };

  if (offset === 0) {
    const totals = { shifts: 0, orders: 0, sales: 0, cash: 0, other: 0, expenses: 0 };
    for (let start = 0, i = 0; i < 30; i++, start += 1000) {
      const { data: part, error: e2 } = await build("orders_count, sales_amount, cash_amount, other_amount, expenses_amount")
        .order("id", { ascending: true })
        .range(start, start + 999);
      if (e2) break;
      for (const r of (part ?? []) as unknown as Record<string, number | null>[]) {
        totals.shifts += 1;
        totals.orders += Number(r.orders_count) || 0;
        totals.sales += Number(r.sales_amount) || 0;
        totals.cash += Number(r.cash_amount) || 0;
        totals.other += Number(r.other_amount) || 0;
        totals.expenses += Number(r.expenses_amount) || 0;
      }
      if ((part ?? []).length < 1000) break;
    }
    body.totals = totals;
  }
  return NextResponse.json(body);
}
