import type { SupabaseClient } from "@supabase/supabase-js";

/** Bill extras the POS adds on top of what create_sale() knows about (items + tax + delivery):
 *  the dine-in service charge and the FBR invoicing fee. create_sale() is a database function we
 *  don't change, so they are applied right after it succeeds: the sale's total, its paid/unpaid
 *  status and (when migration 0016 is applied) the two breakdown columns are updated together. */
export type SaleExtras = {
  serviceCharge?: unknown;
  fbrFee?: unknown;
  /** money taken off the item subtotal (before tax) */
  discount?: unknown;
  discountPercent?: unknown;
  /** tax that create_sale() charged on the discounted part; taken off the total again */
  taxReduction?: unknown;
  orderNote?: unknown;
  itemNotes?: unknown;
  /** set for sales made on a desktop device: D<deviceNo>-<seq> */
  displayId?: string | null;
  deviceId?: string | null;
  deviceSeq?: number | null;
};
export type SaleBase = { orderNo: number | string | null; total: number; status: string; balance: number };

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : 0;
};

const cleanText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Item notes arrive as [{productId, name, note}]; keep only well-formed, non-empty ones. */
export function cleanItemNotes(v: unknown): { productId: string; name: string; note: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => ({ productId: cleanText(x?.productId, 64), name: cleanText(x?.name, 160), note: cleanText(x?.note, 300) }))
    .filter((x) => x.note)
    .slice(0, 100);
}

/** One lookup and one UPDATE for everything the POS adds on top of create_sale(): service charge,
 *  FBR fee, discount, notes and the device order id. Falls back to the older column set when a
 *  migration has not been applied yet, so a sale is never lost to a missing column. */
export async function applySaleExtras(
  admin: SupabaseClient,
  restaurantId: string,
  base: SaleBase,
  extras: SaleExtras,
  paid: number
): Promise<SaleBase & { saleId: string | null }> {
  const serviceCharge = money(extras.serviceCharge);
  const fbrFee = money(extras.fbrFee);
  const discount = money(extras.discount);
  const taxReduction = discount > 0 ? money(extras.taxReduction) : 0;
  const discountPercent = discount > 0 ? Math.min(100, money(extras.discountPercent)) : 0;
  const orderNote = cleanText(extras.orderNote, 500);
  const itemNotes = cleanItemNotes(extras.itemNotes);
  const displayId = extras.displayId ?? null;
  const net = serviceCharge + fbrFee - discount - taxReduction;

  const hasMeta = !!(orderNote || itemNotes.length || displayId || discount > 0);
  let saleId: string | null = null;
  if (base.orderNo != null && base.orderNo !== "") {
    const { data: row } = await admin
      .from("sales")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("order_no", base.orderNo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    saleId = row?.id ?? null;
  }
  if (!saleId || (net === 0 && !hasMeta)) return { ...base, saleId };

  const total = Math.max(0, Math.round((Number(base.total) + net) * 100) / 100);
  const status = base.status === "cancelled" ? base.status : paid + 0.005 >= total ? base.status : "unpaid";
  const core = { total, status };
  const charges = { service_charge: serviceCharge, fbr_fee: fbrFee };
  const meta = {
    discount_amount: discount,
    discount_percent: discountPercent,
    order_note: orderNote || null,
    item_notes: itemNotes,
    display_id: displayId,
    device_id: extras.deviceId ?? null,
    device_seq: extras.deviceSeq ?? null,
  };

  // newest schema first, then step back so older databases still work
  const { display_id, device_id, device_seq, ...notesOnly } = meta;
  let { error } = await admin.from("sales").update({ ...core, ...charges, ...meta }).eq("id", saleId);
  // e.g. the device order id is already taken (app reinstalled): keep the sale, drop only the id
  if (error) ({ error } = await admin.from("sales").update({ ...core, ...charges, ...notesOnly }).eq("id", saleId));
  if (error) ({ error } = await admin.from("sales").update({ ...core, ...charges }).eq("id", saleId));
  if (error) ({ error } = await admin.from("sales").update(core).eq("id", saleId));
  if (error) {
    console.error("sale extras not applied", error);
    return { ...base, saleId };
  }
  return { orderNo: base.orderNo, total, status, balance: Math.max(0, Math.round((total - paid) * 100) / 100), saleId };
}

/** Clamp a requested discount to the item subtotal and work out the tax create_sale() will have
 *  charged on the part that was discounted (the discount comes off BEFORE tax). */
export function discountTaxReduction(
  items: { price?: unknown; qty?: unknown }[],
  requested: unknown,
  taxPct: number
): { discount: number; taxReduction: number } {
  const sub = items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  const discount = Math.min(money(requested), sub);
  if (discount <= 0) return { discount: 0, taxReduction: 0 };
  const taxReduction = Math.round((sub * taxPct) / 100) - Math.round(((sub - discount) * taxPct) / 100);
  return { discount, taxReduction: Math.max(0, taxReduction) };
}

export type CustomerUpdate = { name?: unknown; phone?: unknown; address?: unknown; areaId?: unknown };

/** The cashier edited an existing customer's details in the checkout popup: save them. Never
 *  fails the sale — a rejected update (for example a phone number that belongs to another
 *  customer) is logged and skipped. */
export async function applyCustomerUpdate(admin: SupabaseClient, restaurantId: string, customerId: string | null | undefined, u: CustomerUpdate | undefined) {
  if (!customerId || !u || typeof u !== "object") return;
  const patch: Record<string, unknown> = {};
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const name = text(u.name, 120);
  const phone = text(u.phone, 40);
  const address = text(u.address, 300);
  if (name) patch.name = name;
  if (phone) patch.phone = phone;
  if (address !== undefined) patch.address = address;
  if (u.areaId === null || typeof u.areaId === "string") patch.area_id = u.areaId || null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await admin.from("customers").update(patch).eq("id", customerId).eq("restaurant_id", restaurantId);
  if (error) console.error("customer update skipped", error.message);
}
