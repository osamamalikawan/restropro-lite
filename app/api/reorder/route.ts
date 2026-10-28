import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

const KINDS = ["payment_methods", "tables", "delivery_areas"] as const;
type Kind = (typeof KINDS)[number];

/** Saves a drag-and-drop / up-down reordering from Settings. Body: { kind, ids } where ids is the
 *  full list in its new order. Same permission as editing that list: payment methods need the
 *  "settings" module; tables and delivery areas need admin/manager (see their own routes). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { kind, ids } = (await req.json().catch(() => ({}))) as { kind?: string; ids?: unknown };
  if (!KINDS.includes(kind as Kind) || !Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "kind and a list of ids are required" }, { status: 400 });
  }

  const allowed =
    kind === "payment_methods"
      ? await hasModuleAccess(session.restaurantId, session.role, "settings")
      : session.role === "admin" || session.role === "manager";
  if (!allowed) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const admin = createAdminClient();
  const results = await Promise.all(
    (ids as string[]).map((id, index) =>
      admin
        .from(kind as Kind)
        .update({ sort_order: index + 1 })
        .eq("id", id)
        .eq("restaurant_id", session.restaurantId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    const missing = /sort_order/.test(failed.error.message);
    return NextResponse.json(
      { error: missing ? "Run migration 0016 in Supabase first (adds the sort_order column)." : failed.error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true });
}
