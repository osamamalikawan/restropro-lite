import type { createAdminClient } from "@/lib/supabase/admin";

const BASE = "id, restaurant_id, category_id, name, price, image_url, is_available, updated_at";

/** Live products of a restaurant, with the category (name, order, colour) joined.
 *  Falls back step by step when a migration hasn't been applied yet (0018 deleted_at, 0021 name_ur / color, 0022 category name_ur),
 *  so the app keeps working in the meantime, just without the newer fields. */
export async function listProducts(admin: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const attempts: { cols: string; live: boolean }[] = [
    { cols: `${BASE}, name_ur, menu_categories(name, name_ur, sort_order, color)`, live: true }, // 0022 adds the category's Urdu name
    { cols: `${BASE}, name_ur, menu_categories(name, sort_order, color)`, live: true },
    { cols: `${BASE}, menu_categories(name, sort_order)`, live: true },
    { cols: `${BASE}, name_ur, menu_categories(name, name_ur, sort_order, color)`, live: false },
    { cols: `${BASE}, name_ur, menu_categories(name, sort_order, color)`, live: false },
    { cols: `${BASE}, menu_categories(name, sort_order)`, live: false },
  ];
  let last: { data: any; error: any } = { data: null, error: null };
  for (const a of attempts) {
    let q: any = admin.from("products").select(a.cols).eq("restaurant_id", restaurantId).order("name");
    if (a.live) q = q.is("deleted_at", null); // removed products stay in the database for old sales but are never listed
    last = await q;
    if (!last.error) return last;
    if (!/deleted_at|name_ur|color/.test(last.error.message)) return last; // a real error, don't mask it
  }
  return last;
}
