import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { computeStatus, isUsable } from "@/lib/subscription";

type Restaurant = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string | null;
  password_hash: string | null;
  status: string;
};

export type ResolveOwnerResult = { restaurant: Restaurant } | { error: string; status: number };

/** Shared owner-credential verification — used by both the web pre-login flow
 *  (/api/staff/resolve-restaurant) and desktop device activation (/api/device/activate).
 *  Extracted so the two call sites can't drift apart over time. */
export async function resolveRestaurantByCredentials(email: string, password: string): Promise<ResolveOwnerResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, slug, name, owner_user_id, password_hash, status")
    .eq("email", normalizedEmail)
    .single();

  if (!restaurant) return { error: "Incorrect email or password", status: 401 };

  let validPassword = false;

  if (restaurant.password_hash) {
    validPassword = await verifyPassword(password, restaurant.password_hash);
  } else if (restaurant.owner_user_id) {
    const authClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    validPassword = !signInError && !!signInData.user;

    if (validPassword) {
      await admin.from("restaurants").update({ password_hash: await hashPassword(password) }).eq("id", restaurant.id);
    }
  }

  if (!validPassword) return { error: "Incorrect email or password", status: 401 };
  if (restaurant.status !== "active") {
    return { error: `This restaurant's account is ${restaurant.status}.`, status: 403 };
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("current_period_end, grace_until, status")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sub && !isUsable(computeStatus(sub))) {
    return { error: "Subscription expired. Contact support to reactivate.", status: 402 };
  }

  return { restaurant };
}