import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildClockOutReport } from "@/lib/shifts";
import { clockOutEmployee } from "@/lib/attendance";

/** Confirmed clock-out: recomputes the shift figures right now and freezes them into the shift row
 *  (status closed). Signing out itself is still /api/staff/logout (or the device's staff_logout). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clockIn?: string };
  const admin = createAdminClient();
  try {
    const r = await buildClockOutReport(admin, session, b.clockIn);
    if (r.shift) {
      const s = r.summary;
      const { error } = await admin
        .from("staff_shifts")
        .update({
          clock_out_at: r.clockOutAt,
          status: "closed",
          duration_minutes: r.durationMinutes,
          orders_count: s.orders,
          sales_amount: s.salesAmount,
          cash_amount: s.cash,
          other_amount: s.otherTotal,
          other_breakdown: s.other,
          unpaid_amount: s.unpaid,
          expenses_amount: s.expenses,
        })
        .eq("id", r.shift.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await clockOutEmployee(admin, { restaurantId: session.restaurantId, employeeId: session.employeeId }).catch(() => {});
    return NextResponse.json({ success: true, recorded: !!r.shift, warning: r.warning ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not clock out" }, { status: 500 });
  }
}
