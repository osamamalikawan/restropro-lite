import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type SessionPolicy = {
  /** one device per user: a user already signed in somewhere can't sign in on a second device */
  singleDevice: boolean;
  /** a session nobody has touched for this long (tab closed, device off) is signed out */
  idleMs: number;
};

export const DEFAULT_IDLE_MINUTES = 5;

// Read on every request, so keep it for a short while instead of querying each time.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; policy: SessionPolicy }>();

export async function getSessionPolicy(admin: Admin, restaurantId: string): Promise<SessionPolicy> {
  const hit = cache.get(restaurantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.policy;
  const { data } = await admin.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  const mins = Math.round(Number(data?.idle_logout_minutes));
  const policy: SessionPolicy = {
    singleDevice: data?.single_device_login !== false, // on unless it was switched off
    idleMs: (Number.isFinite(mins) && mins >= 2 ? Math.min(mins, 60) : DEFAULT_IDLE_MINUTES) * 60_000,
  };
  cache.set(restaurantId, { at: Date.now(), policy });
  return policy;
}

export function clearSessionPolicyCache(restaurantId: string) {
  cache.delete(restaurantId);
}
