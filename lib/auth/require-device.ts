import { createAdminClient } from "@/lib/supabase/admin";
import { computeStatus, isUsable } from "@/lib/subscription";

export type DeviceContext = { deviceId: string; restaurantId: string };
export type DeviceAuth =
  | { ok: true; device: DeviceContext }
  | { ok: false; status: number; code: string; error: string };

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Auth for the desktop app's /api/device/* routes (the counterpart of requireStaffSession).
 *  The desktop sends `Authorization: Bearer <deviceToken>` — the token issued once by
 *  /api/device/activate. We hash it and look it up; the plain token is never stored.
 *  Also refuses devices of inactive restaurants / expired subscriptions, so a cut-off
 *  tenant stops syncing even though the device itself is still valid. */
export async function requireDevice(req: Request): Promise<DeviceAuth> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, code: "missing_token", error: "Device token required" };

  const admin = createAdminClient();
  const { data: device } = await admin
    .from("devices")
    .select("id, restaurant_id, revoked_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!device || device.revoked_at) {
    return { ok: false, status: 401, code: "device_revoked", error: "This device is no longer authorised. Activate it again." };
  }

  const { data: restaurant } = await admin.from("restaurants").select("status").eq("id", device.restaurant_id).single();
  if (!restaurant || restaurant.status !== "active") {
    return { ok: false, status: 403, code: "restaurant_inactive", error: "This restaurant account is not active." };
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", device.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (sub && !isUsable(computeStatus(sub))) {
    return { ok: false, status: 402, code: "subscription_expired", error: "Subscription expired. Renew to keep syncing." };
  }

  await admin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return { ok: true, device: { deviceId: device.id, restaurantId: device.restaurant_id } };
}
