import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionPolicy } from "@/lib/auth/session-policy";

/** "Still here" ping from an open tab (every ~20 s) - requireStaffSession() records it. Returns 401 once the session is
 *  over (signed in elsewhere, idle too long, deactivated), which sends the page to the login screen.
 *
 *  ?closing=1 is sent (sendBeacon) when a tab is being closed: it backdates last_seen so the session ends about 40 s
 *  later unless another tab or a page reload pings again first - so closing the app signs the user out within a minute,
 *  without waiting for the full idle time. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Session ended" }, { status: 401 });

  if (new URL(req.url).searchParams.get("closing") === "1" && (await cookies()).get(STAFF_SESSION_COOKIE)?.value) {
    const admin = createAdminClient();
    const policy = await getSessionPolicy(admin, session.restaurantId);
    const seen = new Date(Date.now() - Math.max(policy.idleMs - 40_000, 0)).toISOString();
    await admin.from("employees").update({ last_seen_at: seen }).eq("id", session.employeeId);
  }
  return NextResponse.json({ ok: true });
}
