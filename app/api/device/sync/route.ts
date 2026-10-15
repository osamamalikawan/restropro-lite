import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth/require-device";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPermissionMatrix } from "@/lib/permissions";
import { computeStatus } from "@/lib/subscription";
import { listProducts } from "@/lib/products-query";

/** Owner-defined order (sort_order) first; plain order if migration 0016 isn't applied yet. */
async function ordered<T extends { order: (col: string) => any }>(build: () => T, fallbackCol: string) {
  const first = await (build().order("sort_order") as any).order(fallbackCol);
  return first.error ? await (build().order(fallbackCol) as any) : first;
}

/** Everything the desktop POS needs to run offline, in one round trip. The device calls this
 *  on activation, then whenever it is online (see restropro-desk/src/sync.rs). The response is
 *  stored verbatim in the device's local database, so keep the shapes identical to the staff
 *  routes the POS screen already understands (/api/products, /api/tables, ...). */
export async function GET(req: Request) {
  const auth = await requireDevice(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  const rid = auth.device.restaurantId;
  const admin = createAdminClient();

  const [restaurant, products, tables, areas, methods, staff, customers, settingsRes] = await Promise.all([
    admin.from("restaurants").select("name, address, phone, slug").eq("id", rid).single(),
    listProducts(admin, rid), // removed products are hidden (0018); Urdu name + category colour come with 0021
    ordered(() => admin.from("tables").select("id, number, seats, is_active").eq("restaurant_id", rid), "number"),
    ordered(() => admin.from("delivery_areas").select("id, name, delivery_fee, is_active").eq("restaurant_id", rid), "name"),
    ordered(() => admin.from("payment_methods").select("id, name").eq("restaurant_id", rid), "name"),
    admin.from("employees").select("id, name, role, pin_hash, status").eq("restaurant_id", rid).not("pin_hash", "is", null),
    admin
      .from("customers")
      .select("id, name, phone, address, area_id, delivery_areas(name)")
      .eq("restaurant_id", rid)
      .order("name")
      .limit(5000),
    admin.from("restaurant_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
  ]);

  const failed = [restaurant, products, tables, areas, methods, staff, customers, settingsRes].find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  const [permissionMatrix, subRes, recentSales] = await Promise.all([
    getPermissionMatrix(rid),
    admin
      .from("subscriptions")
      .select("current_period_end, grace_until, status")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Newest orders (same shape as GET /api/sales) so Ticket Rail, Sales and Unpaid Orders have
    // something to show with no internet. Unpaid orders are always included, however old.
    admin
      .from("sales")
      .select("*, customers(name, phone), tables(number), sale_items(*), sale_payments(*)")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200),
  ]);

  let settings = settingsRes.data;
  if (!settings) {
    const { data: created } = await admin.from("restaurant_settings").insert({ restaurant_id: rid }).select("*").single();
    settings = created;
  }

  // This device's number (D<n>-0001 order ids). Absent until migration 0017 is applied.
  const { data: devRow } = await admin.from("devices").select("device_no").eq("id", auth.device.deviceId).maybeSingle();

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    deviceNo: devRow?.device_no ?? null,
    restaurant: restaurant.data,
    settings: settings ?? {},
    products: products.data ?? [],
    tables: tables.data ?? [],
    areas: areas.data ?? [],
    paymentMethods: methods.data ?? [],
    customers: customers.data ?? [],
    staffRoster: staff.data ?? [],
    /** role -> module -> can_view, so the desktop sidebar and page guards work offline */
    permissionMatrix,
    recentSales: recentSales.data ?? [],
    subStatus: subRes.data ? computeStatus(subRes.data) : "expired",
  });
}
