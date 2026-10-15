import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin } from "@/lib/auth/pin";
import { createStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { computeStatus, isUsable } from "@/lib/subscription";
import { ensureOpenShift } from "@/lib/shifts";
import { getSessionPolicy } from "@/lib/auth/session-policy";

const DEVICE_COOKIE = "rp_device"; // random id of this browser, so it can always sign back in to its own session

/**
 * Staff PIN login. Body: { restaurantSlug: string, employeeId: string, pin: string }.
 * Matches the prototype's flow: the picker (step 2, /api/staff/employees) already told the
 * UI which employee this is, so the PIN only needs to be checked against that one row —
 * not iterated across the whole tenant. Still re-checks restaurant status + subscription
 * grace/expiry here (never trust step 2's response alone).
 */
export async function POST(req: Request) {
  const { restaurantSlug, employeeId, pin } = (await req.json().catch(() => ({}))) as {
    restaurantSlug?: string;
    employeeId?: string;
    pin?: string;
  };
  if (!restaurantSlug || !employeeId || !pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "restaurantSlug, employeeId and a 4-digit pin are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, status")
    .eq("slug", restaurantSlug)
    .single();
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (restaurant.status !== "active") {
    return NextResponse.json({ error: `This restaurant's account is ${restaurant.status}.` }, { status: 403 });
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (sub) {
    const status = computeStatus(sub);
    if (!isUsable(status)) {
      return NextResponse.json({ error: "Subscription expired. Contact support to reactivate." }, { status: 402 });
    }
  }

  const { data: emp } = await admin
    .from("employees")
    .select("id, pin_hash, role, status, session_version")
    .eq("id", employeeId)
    .eq("restaurant_id", restaurant.id)
    .single();

  if (!emp || emp.status !== "active" || !(await verifyPin(pin, emp.pin_hash))) {
    return NextResponse.json({ error: "Incorrect PIN — try again" }, { status: 401 });
  }

  // One device per user: refuse while this person is still signed in (and active) on a different browser/device.
  // Their own browser can always sign back in. If the other device was closed or switched off, it stops counting as
  // active after the idle time and this sign-in goes through (and the old session is dead from then on).
  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value || crypto.randomUUID();
  const policy = await getSessionPolicy(admin, restaurant.id);
  const track = await admin.from("employees").select("name, active_sid, active_device, last_seen_at").eq("id", emp.id).single();
  const tracked = !track.error; // false until migration 0028 is run: no session tracking, sign-in works as before
  if (tracked && policy.singleDevice && track.data.active_sid && track.data.last_seen_at && track.data.active_device !== deviceId) {
    const activeUntil = Date.parse(track.data.last_seen_at) + policy.idleMs;
    if (activeUntil > Date.now()) {
      const wait = Math.max(1, Math.ceil((activeUntil - Date.now()) / 60_000));
      return NextResponse.json(
        {
          error: `${track.data.name ?? "This user"} is already signed in on another device. Sign out there, or close it and try again in about ${wait} minute${wait === 1 ? "" : "s"}.`,
          code: "already_signed_in",
          retryAfterSeconds: Math.ceil((activeUntil - Date.now()) / 1000),
        },
        { status: 409 }
      );
    }
  }

  const sid = tracked ? crypto.randomUUID() : undefined;
  if (tracked) {
    await admin.from("employees").update({ active_sid: sid, active_device: deviceId, last_seen_at: new Date().toISOString() }).eq("id", emp.id);
  }
  const token = await createStaffSessionToken({
    restaurantId: restaurant.id,
    employeeId: emp.id,
    role: emp.role,
    sessionVersion: emp.session_version,
    sid,
  });
  // Clock in: open this employee's shift (or keep the one already open). Never blocks the sign-in.
  await ensureOpenShift(admin, restaurant.id, emp.id).catch(() => {});
  const res = NextResponse.json({ success: true });
  res.cookies.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  res.cookies.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
  return res;
}
