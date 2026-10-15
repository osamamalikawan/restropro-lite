import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  let { data } = await admin
    .from("expense_categories")
    .select("id, name")
    .eq("restaurant_id", session.restaurantId)
    .order("name");

  if (!data || data.length === 0) {
    const defaults = ["Utilities", "Rent", "Maintenance", "Marketing", "Salaries", "Other"];
    const { data: created, error } = await admin
      .from("expense_categories")
      .insert(defaults.map((name) => ({ restaurant_id: session.restaurantId, name })))
      .select("id, name");
    if (!error) data = created;
  }

  return NextResponse.json({ categories: data ?? [] });
}

/** Admin-only, same as the rest of the Users & Permissions page. Body: { op: "insert" |
 *  "delete", row: { name } | { id } }. Mirrors addExpenseCategory()/removeExpenseCategory()
 *  in the prototype, including the "at least one category" guard. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: { id?: string; name?: string } };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "delete") {
    const { count } = await admin
      .from("expense_categories")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", session.restaurantId);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "At least one category is required" }, { status: 400 });
    }
    const { error } = await admin
      .from("expense_categories")
      .delete()
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const name = row.name?.trim();
  if (!name) return NextResponse.json({ error: "Enter a category name" }, { status: 400 });
  const { error } = await admin.from("expense_categories").insert({ restaurant_id: session.restaurantId, name });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That category already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
