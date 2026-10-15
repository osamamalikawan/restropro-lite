import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

const DEFAULTS = ["Cash", "Card", "JazzCash", "Easypaisa", "Bank Transfer"];

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const base = () => admin.from("payment_methods").select("id, name").eq("restaurant_id", session.restaurantId);
  let { data, error: listError } = await base().order("sort_order").order("name");
  if (listError) ({ data } = await base().order("name")); // migration 0016 not applied yet

  if (!data || data.length === 0) {
    const { data: created, error } = await admin
      .from("payment_methods")
      .insert(DEFAULTS.map((name) => ({ restaurant_id: session.restaurantId, name })))
      .select("id, name");
    if (!error) data = created;
  }

  return NextResponse.json({ methods: data ?? [] });
}

/** Gated on the "settings" module, same as the rest of the Settings page (Payment Methods
 *  is folded into Settings — see nav-config.ts's `perm: "settings"` for that nav item).
 *  Body: { op: "insert" | "delete", row: { name } | { id } }. Mirrors
 *  addPaymentMethod()/removePaymentMethod() in the prototype, "at least one" guard included. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "settings"))) {
    return NextResponse.json({ error: "Not permitted to change payment methods" }, { status: 403 });
  }

  const { op, row } = (await req.json().catch(() => ({}))) as { op?: string; row?: { id?: string; name?: string } };
  if (!op || !row) return NextResponse.json({ error: "op and row are required" }, { status: 400 });

  const admin = createAdminClient();

  if (op === "delete") {
    const { count } = await admin
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", session.restaurantId);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "At least one payment method is required" }, { status: 400 });
    }
    const { error } = await admin
      .from("payment_methods")
      .delete()
      .eq("id", row.id)
      .eq("restaurant_id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const name = row.name?.trim();
  if (!name) return NextResponse.json({ error: "Enter a payment method name" }, { status: 400 });
  const { error } = await admin.from("payment_methods").insert({ restaurant_id: session.restaurantId, name });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That method already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
