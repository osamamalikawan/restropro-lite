import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** A deal is a `products` row with is_deal = true, always filed under the "Deals" menu
 *  category so it shows up as its own tab in POS alongside regular categories. Its
 *  composition (2+ component products + qty) lives in deal_items; the DB keeps the deal's
 *  recipe_items flattened from that automatically (see add_deals_support migration), so
 *  stock deduction on sale needs no special-casing anywhere else. */
async function dealsCategoryId(admin: ReturnType<typeof createAdminClient>, restaurantId: string) {
  const { data: existing } = await admin.from("menu_categories").select("id").eq("restaurant_id", restaurantId).eq("name", "Deals").maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("menu_categories")
    .insert({ restaurant_id: restaurantId, name: "Deals", sort_order: 999 })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const items =
    "deal_items!deal_items_deal_product_id_fkey(id, quantity, component_product_id, component:products!deal_items_component_product_id_fkey(id, name, name_ur, price))";
  const itemsOld =
    "deal_items!deal_items_deal_product_id_fkey(id, quantity, component_product_id, component:products!deal_items_component_product_id_fkey(id, name, price))";
  const list = (cols: string, live: boolean) => {
    let q: any = admin.from("products").select(cols).eq("restaurant_id", session.restaurantId).eq("is_deal", true).order("name");
    if (live) q = q.is("deleted_at", null); // removed deals are hidden (see migration 0018)
    return q;
  };
  // fall back step by step when migration 0018 (deleted_at) or 0021 (name_ur) isn't applied yet
  let res: any = null;
  for (const a of [
    { cols: `id, name, name_ur, description, price, image_url, is_available, updated_at, ${items}`, live: true },
    { cols: `id, name, description, price, image_url, is_available, updated_at, ${itemsOld}`, live: true },
    { cols: `id, name, name_ur, description, price, image_url, is_available, updated_at, ${items}`, live: false },
    { cols: `id, name, description, price, image_url, is_available, updated_at, ${itemsOld}`, live: false },
  ]) {
    res = await list(a.cols, a.live);
    if (!res.error || !/deleted_at|name_ur/.test(res.error.message)) break;
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ deals: res.data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    op?: "insert" | "update" | "delete";
    id?: string;
    name?: string;
    nameUr?: string | null;
    description?: string | null;
    price?: number;
    imageUrl?: string | null;
    isAvailable?: boolean;
    components?: { productId: string; quantity: number }[];
  };
  const admin = createAdminClient();

  if (body.op === "delete") {
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    // Soft delete (admin only): hidden everywhere, row kept for past sales.
    if (session.role !== "admin") return NextResponse.json({ error: "Only an admin can remove deals" }, { status: 403 });
    const { error } = await admin
      .from("products")
      .update({ deleted_at: new Date().toISOString(), is_available: false, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("restaurant_id", session.restaurantId)
      .eq("is_deal", true);
    if (error) {
      const missing = /deleted_at/.test(error.message);
      return NextResponse.json({ error: missing ? "Run migration 0018_soft_delete_products.sql in Supabase first" : error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (!body.name?.trim()) return NextResponse.json({ error: "Deal name is required" }, { status: 400 });
  if (!body.components || body.components.length < 2) {
    return NextResponse.json({ error: "A deal needs at least 2 products" }, { status: 400 });
  }

  let categoryId: string;
  try {
    categoryId = await dealsCategoryId(admin, session.restaurantId);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Could not set up the Deals category" }, { status: 500 });
  }

  const payload = {
    id: body.id ?? undefined,
    restaurant_id: session.restaurantId,
    category_id: categoryId,
    name: body.name.trim(),
    name_ur: body.nameUr?.trim() || null,
    description: body.description?.trim() || null,
    price: Number(body.price) || 0,
    image_url: body.imageUrl?.trim() || null,
    is_available: body.isAvailable ?? true,
    is_deal: true,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error: saveError } = await admin.from("products").upsert(payload).select("id").single();
  if (saveError) {
    const missing = /name_ur/.test(saveError.message);
    return NextResponse.json({ error: missing ? "Run migration 0021_urdu_and_category_colors.sql in Supabase first" : saveError.message }, { status: 500 });
  }

  // replace the component list wholesale — simplest to keep correct, and deal composition
  // lists are always short
  const { error: delError } = await admin.from("deal_items").delete().eq("deal_product_id", saved.id);
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  const { error: insError } = await admin.from("deal_items").insert(
    body.components.map((c) => ({ deal_product_id: saved.id, component_product_id: c.productId, quantity: c.quantity || 1 }))
  );
  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });

  return NextResponse.json({ success: true, id: saved.id });
}
