import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanItemNotes } from "@/lib/sales/extras";

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : 0;
};

type PosEdit = {
  orderType?: string;
  tableId?: string | null;
  areaId?: string | null;
  serviceCharge?: number;
  fbrFee?: number;
  discount?: number;
  orderNote?: string;
  itemNotes?: { productId: string; name: string; note: string }[];
};

/** Order edited on the POS screen. edit_sale() has already swapped the items and put stock back in
 *  balance; this finishes the job the way checkout does: order type / table / area, notes, discount,
 *  service charge and FBR fee, tax at the cash-or-card rate of how it was paid, then the total, the
 *  paid/unpaid status and the income row in accounts. Returns an error message, or null when done. */
export async function applyPosEdit(
  admin: SupabaseClient,
  restaurantId: string,
  saleId: string,
  items: { price: number; qty: number }[],
  deliveryCharge: number,
  pos: PosEdit
): Promise<string | null> {
  const orderType = ["dine_in", "takeaway", "delivery"].includes(pos.orderType ?? "") ? pos.orderType! : null;
  if (!orderType) return "Invalid order type";

  const [{ data: sale }, { data: st }] = await Promise.all([
    admin.from("sales").select("id, status, sale_payments(method, amount)").eq("id", saleId).eq("restaurant_id", restaurantId).maybeSingle(),
    admin.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).single(),
  ]);
  if (!sale) return "Order not found";
  const payments = ((sale as { sale_payments?: { method: string; amount: number }[] }).sale_payments ?? []).map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));

  // tax rate: the cash or card rate of the method that carried the most money (same rule as checkout)
  const method = [...payments].sort((a, b) => b.amount - a.amount)[0]?.method ?? "Cash";
  const legacy = st?.tax_rate != null ? Number(st.tax_rate) : 5;
  const pct = /cash/i.test(method)
    ? st?.cash_tax_rate != null ? Number(st.cash_tax_rate) : legacy
    : st?.card_tax_rate != null ? Number(st.card_tax_rate) : legacy;

  const subtotal = items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  const discountOn = st?.show_discount !== false;
  const discount = discountOn ? Math.min(money(pos.discount), subtotal) : 0;
  const discountPercent = discount > 0 && subtotal > 0 ? Math.min(100, Math.round((discount / subtotal) * 10000) / 100) : 0;
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * pct) / 100);
  const delivery = orderType === "delivery" ? money(deliveryCharge) : 0;
  const serviceCharge = money(pos.serviceCharge);
  const fbrFee = money(pos.fbrFee);
  const total = Math.round((taxable + tax + delivery + serviceCharge + fbrFee) * 100) / 100;
  const paid = payments.reduce((t, p) => t + p.amount, 0);
  const status = (sale as { status: string }).status === "cancelled" ? "cancelled" : paid + 0.005 >= total ? "completed" : "unpaid";

  const core = {
    order_type: orderType,
    table_id: orderType === "dine_in" ? pos.tableId || null : null,
    area_id: orderType === "delivery" ? pos.areaId || null : null,
    delivery_charge: delivery,
    tax,
    total,
    status,
  };
  const charges = { service_charge: serviceCharge, fbr_fee: fbrFee };
  const meta = {
    discount_amount: discount,
    discount_percent: discountPercent,
    order_note: typeof pos.orderNote === "string" && pos.orderNote.trim() ? pos.orderNote.trim().slice(0, 500) : null,
    item_notes: cleanItemNotes(pos.itemNotes),
  };

  // newest column set first, then step back so a database that is missing a migration still saves the order
  let { error } = await admin.from("sales").update({ ...core, ...charges, ...meta }).eq("id", saleId);
  if (error) ({ error } = await admin.from("sales").update({ ...core, ...charges }).eq("id", saleId));
  if (error) ({ error } = await admin.from("sales").update(core).eq("id", saleId));
  if (error) return error.message;

  await admin.from("accounts").update({ amount: total }).eq("sale_id", saleId).eq("type", "income");
  return null;
}
