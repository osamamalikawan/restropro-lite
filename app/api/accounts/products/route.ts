import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Products sold in a date range: { products: [{ productId, name, quantity, total }], totalQuantity, totalAmount }.
 *  ?from= & ?to= are ISO date-times (inclusive), the same as /api/accounts. Cancelled orders are left out.
 *  Grouped by product (product_id when the order line has one, otherwise by the name on the line); the
 *  amount is what was actually charged (unit price x quantity, so prices edited at checkout count). */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const fromOk = from && !Number.isNaN(Date.parse(from)) ? new Date(from).toISOString() : null;
  const toOk = to && !Number.isNaN(Date.parse(to)) ? new Date(to).toISOString() : null;

  const admin = createAdminClient();
  const groups = new Map<string, { productId: string | null; name: string; quantity: number; total: number }>();
  const PAGE = 500;
  const MAX_PAGES = 40; // 20,000 orders: a cap so a huge range can't hang the request

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = admin
      .from("sales")
      .select("id, sale_items(*)")
      .eq("restaurant_id", session.restaurantId)
      .neq("status", "cancelled");
    if (fromOk) query = query.gte("created_at", fromOk);
    if (toOk) query = query.lte("created_at", toOk);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const sales = (data ?? []) as unknown as { sale_items: Record<string, unknown>[] | null }[];
    for (const s of sales) {
      for (const it of s.sale_items ?? []) {
        const qty = Number(it.quantity) || 0;
        const total = (Number(it.unit_price) || 0) * qty;
        const name = String(it.name ?? "");
        const productId = typeof it.product_id === "string" && it.product_id ? it.product_id : null;
        const key = productId ?? `n:${name}`;
        const g = groups.get(key);
        if (g) {
          g.quantity += qty;
          g.total += total;
        } else groups.set(key, { productId, name, quantity: qty, total });
      }
    }
    if (sales.length < PAGE) break;
  }

  const products = [...groups.values()]
    .map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return NextResponse.json({
    products,
    totalQuantity: products.reduce((n, p) => n + p.quantity, 0),
    totalAmount: Math.round(products.reduce((n, p) => n + p.total, 0) * 100) / 100,
  });
}
