import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/auth/require-device";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";
import { applyCustomerUpdate, applySaleExtras, discountTaxReduction, type CustomerUpdate } from "@/lib/sales/extras";

type OfflineSale = {
  clientSaleId: string;
  cashierEmployeeId: string;
  soldAt?: string;
  orderType: string;
  items: { productId: string; name: string; price: number; qty: number }[];
  payments?: { method: string; amount: number }[];
  taxMethod?: string;
  tableId?: string | null;
  areaId?: string | null;
  deliveryCharge?: number;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  serviceCharge?: number;
  fbrFee?: number;
  customerUpdate?: CustomerUpdate;
  discount?: number;
  discountPercent?: number;
  orderNote?: string;
  itemNotes?: { productId: string; name: string; note: string }[];
  /** counter that only this device increments (the Windows app uses its outbox row number) */
  deviceSeq?: number;
};

type SaleResult =
  | { clientSaleId: string; ok: true; orderNo: number | string; displayId?: string | null; total: number; status: string; balance: number; saleId?: string | null; duplicate?: boolean }
  | { clientSaleId: string; ok: false; error: string; retryable: boolean };

const MAX_BATCH = 50;
const BACKDATE_LIMIT_MS = 4 * 24 * 60 * 60 * 1000; // devices must sync every 3 days; small margin on top
const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Upload of sales rung up while the desktop was offline. Same business logic as POST
 *  /api/sales (tax rate from settings, atomic create_sale RPC) but authenticated by device
 *  token + the cashier's employee id, and idempotent on clientSaleId. Returns one result per
 *  sale so the device can mark each as synced / rejected independently. */
export async function POST(req: Request) {
  const auth = await requireDevice(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, code: auth.code }, { status: auth.status });
  const { restaurantId, deviceId } = auth.device;

  const body = (await req.json().catch(() => ({}))) as { sales?: OfflineSale[] };
  const sales = body.sales;
  if (!Array.isArray(sales) || sales.length === 0 || sales.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_BATCH} sales` }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: st }, { data: dev }] = await Promise.all([
    admin.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
    admin.from("devices").select("device_no").eq("id", deviceId).maybeSingle(),
  ]);
  const deviceNo: number | null = dev?.device_no ?? null; // null until migration 0017 is applied

  const cashierCache = new Map<string, { ok: boolean; reason?: string }>();
  async function cashierAllowed(employeeId: string) {
    const hit = cashierCache.get(employeeId);
    if (hit) return hit;
    const { data: emp } = await admin
      .from("employees")
      .select("role, status")
      .eq("id", employeeId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    let res: { ok: boolean; reason?: string };
    if (!emp) res = { ok: false, reason: "Cashier not found for this restaurant" };
    else if (!(await hasModuleAccess(restaurantId, emp.role, "pos"))) res = { ok: false, reason: "Cashier is not permitted to use the POS" };
    else res = { ok: true }; // status is not enforced: a sale already rung up offline must not be lost because the employee was deactivated since
    cashierCache.set(employeeId, res);
    return res;
  }

  const results: SaleResult[] = [];
  for (const s of sales) {
    const id = typeof s?.clientSaleId === "string" ? s.clientSaleId : "";
    const reject = (error: string, retryable = false) => results.push({ clientSaleId: id, ok: false, error, retryable });

    if (!id || id.length > 100) { reject("Missing clientSaleId"); continue; }
    if (!Array.isArray(s.items) || s.items.length === 0) { reject("Order must have at least one item"); continue; }
    if (!["dine_in", "takeaway", "delivery"].includes(s.orderType)) { reject("Invalid order type"); continue; }
    if (!s.cashierEmployeeId) { reject("Missing cashier"); continue; }

    const who = await cashierAllowed(s.cashierEmployeeId);
    if (!who.ok) { reject(who.reason ?? "Not permitted"); continue; }

    // Claim the id first. A unique-violation means this sale was already uploaded (or is in flight).
    const { error: claimError } = await admin
      .from("device_sale_receipts")
      .insert({ restaurant_id: restaurantId, client_sale_id: id, device_id: deviceId });
    if (claimError) {
      if (claimError.code !== "23505") {
        // Not "already uploaded" — the receipts table itself failed (e.g. migration 0015 not applied
        // or the schema cache is stale). Say so, and keep the sale queued on the device (retryable)
        // instead of marking it rejected: nothing is wrong with the sale.
        console.error("device_sale_receipts claim failed", claimError);
        reject(`Server could not record this sale yet — ${claimError.message}`, true);
        continue;
      }
      const { data: prior } = await admin
        .from("device_sale_receipts")
        .select("result, created_at")
        .eq("restaurant_id", restaurantId)
        .eq("client_sale_id", id)
        .maybeSingle();
      if (prior?.result) {
        results.push({ clientSaleId: id, ok: true, duplicate: true, ...(prior.result as { orderNo: number | string; total: number; status: string; balance: number; saleId?: string | null }) });
      } else if (prior && Date.now() - new Date(prior.created_at).getTime() < STALE_CLAIM_MS) {
        reject("This sale is still being processed — retrying shortly", true);
      } else {
        reject("Could not confirm whether this sale was saved. Check Sales on the web app before re-entering it.");
      }
      continue;
    }

    const payments = s.payments ?? [];
    const method = [...payments].sort((a, c) => c.amount - a.amount)[0]?.method ?? s.taxMethod ?? "Cash";
    // Lite app: no tax and no discount, whatever the full app's settings say.
  const pct = 0;

    let created = false; // true once create_sale() has committed — from then on the sale exists
    try {
      const { data, error } = await admin.rpc("create_sale", {
        p_restaurant_id: restaurantId,
        p_cashier_employee_id: s.cashierEmployeeId,
        p_order_type: s.orderType,
        p_items: s.items,
        p_payments: payments,
        p_tax_rate: pct / 100,
        p_table_id: s.tableId || null,
        p_area_id: s.areaId || null,
        p_delivery_charge: s.orderType === "delivery" ? s.deliveryCharge ?? 0 : 0,
        p_customer_id: s.customerId || null,
        p_customer_name: s.customerName || null,
        p_customer_phone: s.customerPhone || null,
        p_customer_address: s.customerAddress || null,
      });

      if (error) {
        // Release the claim so the cashier can fix the cause (e.g. stock) and retry the same sale.
        await admin.from("device_sale_receipts").delete().eq("restaurant_id", restaurantId).eq("client_sale_id", id);
        reject(error.message);
        continue;
      }
      created = true;

      const r = ((Array.isArray(data) ? data[0] : data) ?? {}) as { order_no?: number | string; total?: number; status?: string; balance?: number };
      // Dine-in service charge / FBR fee go into the bill total; the lookup also returns the new
      // sale's id, which lets the device map Ticket Rail moves made while the sale was still only
      // on the device.
      const paid = payments.reduce((t, p) => t + (Number(p.amount) || 0), 0);
      // The order id is built HERE from this device's number + its own counter, never taken as text
      // from the device: D2-0045. (Same device + same counter can only ever be stored once.)
      const seq = Number.isInteger(s.deviceSeq) && (s.deviceSeq as number) > 0 ? (s.deviceSeq as number) : null;
      const displayId = deviceNo && seq ? `D${deviceNo}-${String(seq).padStart(4, "0")}` : null;
      const discountOn = st?.show_discount !== false;
      const { discount, taxReduction } = discountOn ? discountTaxReduction(s.items, s.discount, pct) : { discount: 0, taxReduction: 0 };
      const [done] = await Promise.all([
        applySaleExtras(
          admin,
          restaurantId,
          { orderNo: r.order_no ?? null, total: Number(r.total ?? 0), status: r.status ?? "", balance: Number(r.balance ?? 0) },
          {
            serviceCharge: s.serviceCharge,
            fbrFee: s.fbrFee,
            discount,
            taxReduction,
            discountPercent: s.discountPercent,
            orderNote: s.orderNote,
            itemNotes: s.itemNotes,
            displayId,
            deviceId: displayId ? deviceId : null,
            deviceSeq: displayId ? seq : null,
          },
          paid
        ),
        applyCustomerUpdate(admin, restaurantId, s.customerId, s.customerUpdate),
      ]);
      const saleId = done.saleId;
      const result = { orderNo: done.orderNo ?? "", displayId, total: done.total, status: done.status, balance: done.balance, saleId };

      const { error: receiptError } = await admin
        .from("device_sale_receipts")
        .update({ result })
        .eq("restaurant_id", restaurantId)
        .eq("client_sale_id", id);
      if (receiptError) console.error("device_sale_receipts result not stored", receiptError);

      // Keep the real sale time for reports (create_sale stamps "now"). Best effort, clamped, and
      // limited to rows created in the last few minutes so a reused order_no can never touch an
      // older sale.
      const soldAt = s.soldAt ? new Date(s.soldAt).getTime() : NaN;
      if (r.order_no != null && Number.isFinite(soldAt) && soldAt <= Date.now() && Date.now() - soldAt <= BACKDATE_LIMIT_MS) {
        await admin
          .from("sales")
          .update({ created_at: new Date(soldAt).toISOString() })
          .eq("restaurant_id", restaurantId)
          .eq("order_no", r.order_no)
          .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
      }

      results.push({ clientSaleId: id, ok: true, ...result });
    } catch (e) {
      console.error("device sale upload failed", e);
      if (created) {
        // The sale is saved; only the bookkeeping after it failed. Tell the device it is done so
        // it is not retried (a retry would find a claim with no result and be refused).
        results.push({ clientSaleId: id, ok: true, orderNo: "", total: 0, status: "", balance: 0 });
      } else {
        await admin.from("device_sale_receipts").delete().eq("restaurant_id", restaurantId).eq("client_sale_id", id);
        reject(`Server error while saving this sale — ${e instanceof Error ? e.message : "unknown"}`, true);
      }
    }
  }

  return NextResponse.json({ results });
}
