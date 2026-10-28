import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureOpenShift, parseClockInHint } from "@/lib/shifts";

/** Desktop app: opens (or reuses) the signed-in cashier's shift once their PIN was checked on the device.
 *  The web app does this inside /api/staff/login. Body: { clockIn?: ISO time the device remembers }. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clockIn?: string };
  const { shift, warning } = await ensureOpenShift(createAdminClient(), session.restaurantId, session.employeeId, parseClockInHint(b.clockIn));
  return NextResponse.json({ clockInAt: shift?.clock_in_at ?? null, warning });
}
