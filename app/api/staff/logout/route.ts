import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STAFF_SESSION_COOKIE, verifyStaffSessionToken } from "@/lib/auth/staff-session";
import { createAdminClient } from "@/lib/supabase/admin";

/** Clears the httpOnly staff session cookie — client JS can't do this directly since the
 *  cookie is httpOnly (deliberately, so it isn't readable/stealable via XSS).
 *  Also frees this user's "signed in" slot, so they can sign in on another device straight away. */
export async function POST() {
  try {
    const session = await verifyStaffSessionToken((await cookies()).get(STAFF_SESSION_COOKIE)?.value);
    if (session?.sid) {
      // only if this is still the live session - an old device's logout must not end a newer sign-in
      await createAdminClient().from("employees").update({ active_sid: null, last_seen_at: null }).eq("id", session.employeeId).eq("active_sid", session.sid);
    }
  } catch {
    /* tracking columns missing (migration 0028) or a hiccup: the cookie is still cleared below */
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(STAFF_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
