import type { createAdminClient } from "@/lib/supabase/admin";
import { clockInEmployee } from "@/lib/attendance";

type Admin = ReturnType<typeof createAdminClient>;

/** A shift older than this that was never clocked out is treated as forgotten ("abandoned"), and the
 *  next sign-in starts a fresh one. Matches the 12-hour staff session plus a margin. */
const STALE_MS = 20 * 60 * 60 * 1000;

export type ShiftSummary = {
  orders: number; // orders taken this shift (cancelled ones left out)
  salesAmount: number; // total of those orders
  cash: number; // paid in cash
  otherTotal: number; // paid by any other account: card, JazzCash, Easypaisa, bank transfer...
  other: { method: string; amount: number }[];
  unpaid: number; // still to be collected on those orders
  expenses: number; // expenses logged during the shift
  expenseCount: number;
};

export type ShiftRow = { id: string; clock_in_at: string; employee_name: string | null };

const money = (n: number) => Math.round(n * 100) / 100;

/** The staff_shifts table comes from migration 0023; until it is run, clock-out still works (it just
 *  isn't recorded), so callers check for this instead of failing. */
export function isMissingShiftTable(err: { message?: string } | null | undefined): boolean {
  return !!err?.message && /staff_shifts/i.test(err.message);
}
export const MIGRATION_WARNING = "Shift records are not being saved yet - run migration 0023_staff_shifts.sql in Supabase.";

/** A usable clock-in time from the caller (the desktop app remembers when its cashier signed in):
 *  a real date, not in the future, and not older than a shift can be. Anything else -> null. */
export function parseClockInHint(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  if (t > Date.now() + 5 * 60_000 || Date.now() - t > STALE_MS) return null;
  return new Date(t).toISOString();
}

/** The employee's open shift, or a new one. An old forgotten shift is marked abandoned first.
 *  `startAt` (when known) is used as the clock-in time of a NEW shift; otherwise it is "now". */
export async function ensureOpenShift(
  admin: Admin,
  restaurantId: string,
  employeeId: string,
  startAt?: string | null
): Promise<{ shift: ShiftRow | null; warning?: string }> {
  const { data: openRows, error } = await admin
    .from("staff_shifts")
    .select("id, clock_in_at, employee_name")
    .eq("restaurant_id", restaurantId)
    .eq("employee_id", employeeId)
    .eq("status", "open")
    .order("clock_in_at", { ascending: false });
  if (error) return { shift: null, warning: isMissingShiftTable(error) ? MIGRATION_WARNING : error.message };

  const open = (openRows ?? []) as ShiftRow[];
  const current = open[0];
  if (current && Date.now() - Date.parse(current.clock_in_at) < STALE_MS) {
    const stale = open.slice(1).map((r) => r.id); // duplicates from a double login
    if (stale.length) await admin.from("staff_shifts").update({ status: "abandoned" }).in("id", stale);
    return { shift: current };
  }
  if (open.length) await admin.from("staff_shifts").update({ status: "abandoned" }).in("id", open.map((r) => r.id));

  const { data: emp } = await admin.from("employees").select("name").eq("id", employeeId).maybeSingle();
  const { data: created, error: insErr } = await admin
    .from("staff_shifts")
    .insert({
      restaurant_id: restaurantId,
      employee_id: employeeId,
      employee_name: emp?.name ?? null,
      clock_in_at: startAt ?? new Date().toISOString(),
    })
    .select("id, clock_in_at, employee_name")
    .single();
  if (insErr) return { shift: null, warning: isMissingShiftTable(insErr) ? MIGRATION_WARNING : insErr.message };
  // Signing in also counts as clocking in on the Attendance page (a no-op if they were already marked in by a manager).
  await clockInEmployee(admin, { restaurantId, employeeId, at: startAt ?? null, source: "app" }).catch(() => {});
  return { shift: created as ShiftRow };
}

/** What this employee did between `fromIso` and `toIso`: their orders and how they were paid, plus the
 *  restaurant's expenses logged in that window (expenses are not tied to an employee in the database). */
export async function computeShiftSummary(
  admin: Admin,
  restaurantId: string,
  employeeId: string,
  fromIso: string,
  toIso: string
): Promise<ShiftSummary> {
  let orders = 0;
  let salesAmount = 0;
  let cash = 0;
  let unpaid = 0;
  const byMethod = new Map<string, number>();

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("sales")
      .select("id, total, status, sale_payments(method, amount)")
      .eq("restaurant_id", restaurantId)
      .eq("cashier_employee_id", employeeId)
      .neq("status", "cancelled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const s of (data ?? []) as unknown as { total: number; status: string; sale_payments: { method: string; amount: number }[] | null }[]) {
      orders += 1;
      const total = Number(s.total) || 0;
      salesAmount += total;
      let paid = 0;
      for (const p of s.sale_payments ?? []) {
        const amt = Number(p.amount) || 0;
        paid += amt;
        if (/cash/i.test(p.method)) cash += amt;
        else byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + amt);
      }
      if (s.status === "unpaid") unpaid += Math.max(total - paid, 0);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  // Expenses logged during the shift. Uses the row's creation time; if that column is not there, falls back to the date.
  let expenses = 0;
  let expenseCount = 0;
  const sumExpenses = (rows: { amount: number }[] | null) => {
    for (const r of rows ?? []) {
      expenses += Number(r.amount) || 0;
      expenseCount += 1;
    }
  };
  const byTime = await admin
    .from("expenses")
    .select("amount")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(5000);
  if (!byTime.error) sumExpenses(byTime.data as { amount: number }[]);
  else {
    const byDate = await admin
      .from("expenses")
      .select("amount")
      .eq("restaurant_id", restaurantId)
      .gte("txn_date", fromIso.slice(0, 10))
      .lte("txn_date", toIso.slice(0, 10))
      .limit(5000);
    if (!byDate.error) sumExpenses(byDate.data as { amount: number }[]);
  }

  const other = [...byMethod.entries()].map(([method, amount]) => ({ method, amount: money(amount) })).sort((a, b) => b.amount - a.amount);
  return {
    orders,
    salesAmount: money(salesAmount),
    cash: money(cash),
    otherTotal: money(other.reduce((t, o) => t + o.amount, 0)),
    other,
    unpaid: money(unpaid),
    expenses: money(expenses),
    expenseCount,
  };
}

/** Everything the clock-out popup and the stored record need, for one employee right now. */
export async function buildClockOutReport(
  admin: Admin,
  session: { restaurantId: string; employeeId: string; issuedAt: number; expiresAt: number },
  hint: unknown
) {
  // A browser login lasts hours (so its sign-in time is a good fallback); a desktop request is stamped "now".
  const cookieIssued = session.expiresAt - session.issuedAt > 3_600_000 ? new Date(session.issuedAt).toISOString() : null;
  const startAt = parseClockInHint(hint) ?? cookieIssued;
  const { shift, warning } = await ensureOpenShift(admin, session.restaurantId, session.employeeId, startAt);

  const clockInAt = shift?.clock_in_at ?? startAt ?? new Date().toISOString();
  const clockOutAt = new Date().toISOString();
  const summary = await computeShiftSummary(admin, session.restaurantId, session.employeeId, clockInAt, clockOutAt);
  let employeeName = shift?.employee_name ?? null;
  if (!employeeName) {
    const { data: emp } = await admin.from("employees").select("name").eq("id", session.employeeId).maybeSingle();
    employeeName = emp?.name ?? null;
  }
  const durationMinutes = Math.max(0, Math.round((Date.parse(clockOutAt) - Date.parse(clockInAt)) / 60_000));
  return { shift, warning, employeeName, clockInAt, clockOutAt, durationMinutes, summary };
}
