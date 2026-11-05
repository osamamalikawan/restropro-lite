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
// A desktop call used to cost 4 queries here (device, restaurant, subscription, last_seen update) before the route's
// own work. Keep a good answer for a short while per server instance, and write last_seen_at at most once a minute.
// A revoked device / deactivated restaurant / expired subscription is cut off within CACHE_MS. Failures are never cached.
const CACHE_MS = 30_000;
const SEEN_EVERY_MS = 60_000;
const authCache = new Map<string, { at: number; seenAt: number; device: DeviceContext }>();

export async function requireDevice(req: Request): Promise<DeviceAuth> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, code: "missing_token", error: "Device token required" };

  const admin = createAdminClient();
  const tokenHash = await sha256Hex(token);
  const hit = authCache.get(tokenHash);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (Date.now() - hit.seenAt >= SEEN_EVERY_MS) {
      hit.seenAt = Date.now();
      await admin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", hit.device.deviceId);
    }
    return { ok: true, device: hit.device };
  }
  authCache.delete(tokenHash);

  const { data: device } = await admin
    .from("devices")
    .select("id, restaurant_id, revoked_at")
    .eq("token_hash", tokenHash)
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
  const ctx: DeviceContext = { deviceId: device.id, restaurantId: device.restaurant_id };
  if (authCache.size > 500) authCache.clear();
  authCache.set(tokenHash, { at: Date.now(), seenAt: Date.now(), device: ctx });
  return { ok: true, device: ctx };
}
