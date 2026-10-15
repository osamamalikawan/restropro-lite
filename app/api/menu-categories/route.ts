import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { isHexColor } from "@/lib/urdu";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const list = (cols: string) =>
    admin.from("menu_categories").select(cols).eq("restaurant_id", session.restaurantId).order("sort_order");
  let res: any = await list("id, name, name_ur, sort_order, is_active, color");
  if (res.error && /name_ur/.test(res.error.message)) res = await list("id, name, sort_order, is_active, color"); // before migration 0022
  if (res.error && /color/.test(res.error.message)) res = await list("id, name, sort_order, is_active"); // before migration 0021
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  return NextResponse.json({ categories: res.data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { op?: string; row?: any; ids?: string[] };
  const { op, row } = body;
  const admin = createAdminClient();

  // Rearranging: ids in the new order. The POS shows categories in this order.
  if (op === "reorder") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids are required" }, { status: 400 });
    const results = await Promise.all(
      ids.map((id, i) =>
        admin.from("menu_categories").update({ sort_order: i, updated_at: new Date().toISOString() }).eq("id", id).eq("restaurant_id", session.restaurantId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });
  if (op === "delete") {
    const { error } = await admin.from("menu_categories").delete().eq("id", row.id).eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const payload = { ...row, restaurant_id: session.restaurantId, updated_at: new Date().toISOString() };
    if ("color" in payload) payload.color = isHexColor(payload.color) ? payload.color.toLowerCase() : null; // null = theme colour
    if ("name_ur" in payload) payload.name_ur = typeof payload.name_ur === "string" && payload.name_ur.trim() ? payload.name_ur.trim() : null; // empty = no Urdu name
    const { error } = await admin.from("menu_categories").upsert(payload);
    if (error) {
      const missingUr = /name_ur/.test(error.message);
      const missing = /color/.test(error.message);
      return NextResponse.json(
        {
          error: missingUr
            ? "Run migration 0022_category_name_ur.sql in Supabase first"
            : missing
              ? "Run migration 0021_urdu_and_category_colors.sql in Supabase first"
              : error.message,
        },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ success: true });
}
