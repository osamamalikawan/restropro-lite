import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRestaurantByCredentials } from "@/lib/auth/resolve-owner";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Desktop device activation — the online-required, once-per-device counterpart to the web
 *  login's step 1. Unlike that endpoint, this also issues a long-lived device token (only
 *  its hash is stored, see migration 0015) and returns the full staff roster INCLUDING
 *  pin_hash, so the desktop app can verify PINs locally afterward with zero network. This
 *  is a narrower trust boundary than the public pre-login endpoints on purpose: only a
 *  device that already proved the owner's password gets pin_hash at all. */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const result = await resolveRestaurantByCredentials(email, password);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const restaurant = result.restaurant;

    const admin = createAdminClient();

    const deviceToken = generateToken();
    const tokenHash = await hashToken(deviceToken);
    const { error: insertError } = await admin.from("devices").insert({ restaurant_id: restaurant.id, token_hash: tokenHash });
    if (insertError) {
      // Previously ignored: activation "succeeded" with a token that was never stored, so the
      // device could never authenticate afterwards. Fail loudly instead.
      console.error("Device activation: could not store device", insertError);
      return NextResponse.json({ error: "Could not register this device. Please try again." }, { status: 500 });
    }

    const { data: staffRoster } = await admin
      .from("employees")
      .select("id, name, role, pin_hash, status")
      .eq("restaurant_id", restaurant.id)
      .not("pin_hash", "is", null);

    return NextResponse.json({
      deviceToken,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      slug: restaurant.slug,
      staffRoster: staffRoster ?? [],
    });
  } catch (err) {
    console.error("Device activation error:", err);
    return NextResponse.json({ error: "Something went wrong while activating this device." }, { status: 500 });
  }
}