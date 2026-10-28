import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildClockOutReport } from "@/lib/shifts";

/** The numbers shown in the clock-out popup: this employee's shift so far. Read-only. ?clockIn= is the
 *  sign-in time a desktop device remembers (used only when the server has no open shift for them). */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const r = await buildClockOutReport(createAdminClient(), session, new URL(req.url).searchParams.get("clockIn"));
    return NextResponse.json({
      employeeName: r.employeeName,
      clockInAt: r.clockInAt,
      clockOutAt: r.clockOutAt,
      durationMinutes: r.durationMinutes,
      summary: r.summary,
      warning: r.warning ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the shift summary" }, { status: 500 });
  }
}
