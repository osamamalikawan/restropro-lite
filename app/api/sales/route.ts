import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { applyCustomerUpdate, applySaleExtras, discountTaxReduction, type CustomerUpdate } from "@/lib/sales/extras";

// NOTE: the order-edit handler that used to live in this file is in app/api/sales/edit/route.ts
// (that's where components/edit-order-modal.tsx posts to).

/** Sales list — used by Sales, Unpaid Orders, Ticket Rail, Customers and Dashboard.
 *  Paged so big histories load fast: ?limit (default 100, max 1000) &offset, plus optional
 *  filters ?status=unpaid|completed|cancelled, ?customerId=, ?q= (order # / customer name / phone).
 *  Returns { sales, hasMore } — one extra row is fetched to know whether another page exists,
 *  which avoids a slow exact COUNT on every request. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 100) || 100, 1), 1000);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const status = sp.get("status");
  const customerId = sp.get("customerId");
  const saleId = sp.get("id"); // one order (the POS loads it here to edit it)
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();

  const admin = createAdminClient();
  let query = admin
    .from("sales")
    .select("*, customers(name, phone, address), tables(number), sale_items(*), sale_payments(*)")
    .eq("restaurant_id", session.restaurantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (status && ["completed", "unpaid", "cancelled"].includes(status)) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);
  if (saleId) {
    if (!/^[0-9a-f-]{32,36}$/i.test(saleId)) return NextResponse.json({ sales: [], hasMore: false });
    query = query.eq("id", saleId);
  }

  if (q) {
    const { data: cust } = await admin
      .from("customers")
      .select("id")
      .eq("restaurant_id", session.restaurantId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(200);
    const ids = (cust ?? []).map((c) => c.id);
    const asNumber = /^\d+$/.test(q) ? Number(q) : null;
    const parts: string[] = [];
    if (asNumber !== null) parts.push(`order_no.eq.${asNumber}`);
    if (ids.length) parts.push(`customer_id.in.(${ids.join(",")})`);
    if (parts.length === 0) return NextResponse.json({ sales: [], hasMore: false });
    query = query.or(parts.join(","));
  }

  const { data, error } = await query.range(offset, offset + limit); // limit + 1 rows
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  return NextResponse.json({ sales: rows.slice(0, limit), hasMore: rows.length > limit });
}

/** POS checkout — the atomic create_sale() Postgres function (stock, payments, customer
 *  auto-create and the accounts entry all happen in one transaction). */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    orderType?: string;
    items?: { productId: string; name: string; price: number; qty: number }[];
    payments?: { method: string; amount: number }[];
    taxMethod?: string;
    tableId?: string | null;
    areaId?: string | null;
    deliveryCharge?: number;
    customerId?: string | null;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    serviceCharge?: number; // dine-in service charge shown on the bill
    fbrFee?: number; // FBR invoicing fee shown on the bill
    customerUpdate?: CustomerUpdate; // edited details of the selected existing customer
    discount?: number; // money off the item subtotal, before tax
    discountPercent?: number;
    orderNote?: string;
    itemNotes?: { productId: string; name: string; note: string }[];
  };
  if (!b.items || b.items.length === 0) {
    return NextResponse.json({ error: "Order must have at least one item" }, { status: 400 });
  }
  if (!["dine_in", "takeaway", "delivery"].includes(b.orderType ?? "")) {
    return NextResponse.json({ error: "Invalid order type" }, { status: 400 });
  }

  const admin = createAdminClient();

  // The tax rate is read here, not trusted from the browser. Cash vs card follows the payment
  // method that carries the most money (or the method selected, when nothing is paid yet).
  // permission check and settings read are independent: run them together (one round trip less)
  const [allowed, { data: st }] = await Promise.all([
    hasModuleAccess(session.restaurantId, session.role, "pos"),
    admin.from("restaurant_settings").select("*").eq("restaurant_id", session.restaurantId).single(),
  ]);
  if (!allowed) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const payments = b.payments ?? [];
  const method = [...payments].sort((a, c) => c.amount - a.amount)[0]?.method ?? b.taxMethod ?? "Cash";
  // Lite app: no tax and no discount, whatever the full app's settings say.
  const pct = 0;

  const { data, error } = await admin.rpc("create_sale", {
    p_restaurant_id: session.restaurantId,
    p_cashier_employee_id: session.employeeId,
    p_order_type: b.orderType,
    p_items: b.items,
    p_payments: payments,
    p_tax_rate: pct / 100,
    p_table_id: b.tableId || null,
    p_area_id: b.areaId || null,
    p_delivery_charge: b.orderType === "delivery" ? b.deliveryCharge ?? 0 : 0,
    p_customer_id: b.customerId || null,
    p_customer_name: b.customerName || null,
    p_customer_phone: b.customerPhone || null,
    p_customer_address: b.customerAddress || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const r = Array.isArray(data) ? data[0] : data;
  const paid = payments.reduce((t, p) => t + (Number(p.amount) || 0), 0);

  // The discount is an admin switch (Settings -> POS controls); when it is off, any discount sent is ignored.
  const discountOn = st?.show_discount !== false;
  const { discount, taxReduction } = discountOn ? discountTaxReduction(b.items, b.discount, pct) : { discount: 0, taxReduction: 0 };
  const [done] = await Promise.all([
    applySaleExtras(
      admin,
      session.restaurantId,
      { orderNo: r.order_no, total: Number(r.total), status: r.status, balance: Number(r.balance ?? 0) },
      {
        serviceCharge: b.serviceCharge,
        fbrFee: b.fbrFee,
        discount,
        taxReduction,
        discountPercent: b.discountPercent,
        orderNote: b.orderNote,
        itemNotes: b.itemNotes,
      },
      paid
    ),
    applyCustomerUpdate(admin, session.restaurantId, b.customerId, b.customerUpdate),
  ]);
  return NextResponse.json({
    success: true,
    orderNo: done.orderNo,
    total: done.total,
    status: done.status,
    balance: done.balance,
  });
}
