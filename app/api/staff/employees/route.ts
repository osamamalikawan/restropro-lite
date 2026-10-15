import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Step 2 of staff login, matching the prototype's "pick your name on staff" screen:
 * given the restaurant slug resolved in step 1 (owner credentials), return the active
 * employees so the UI can render a picker. Only id/name/role are returned — never pin_hash.
 *
 * Trust boundary is the same as /api/staff/login: knowing the slug is what scopes the
 * request to a tenant (see ARCHITECTURE.md). The slug is only ever handed to the client
 * after a successful password check in /api/staff/resolve-restaurant, and it never appears
 * in a URL that would be logged or bookmarked — the client keeps it in sessionStorage.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: restaurant } = await admin.from("restaurants").select("id, name, status").eq("slug", slug).single();
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (restaurant.status !== "active") {
    return NextResponse.json({ error: `This restaurant's account is ${restaurant.status}.` }, { status: 403 });
  }

  const { data: employees } = await admin
    .from("employees")
    .select("id, name, role")
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active")
    .not("pin_hash", "is", null)
    .order("name", { ascending: true });

  return NextResponse.json({ restaurantName: restaurant.name, employees: employees ?? [] });
}
