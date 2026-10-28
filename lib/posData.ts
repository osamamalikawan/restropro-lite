import { invoke } from "@tauri-apps/api/core";

/** Data access for the POS screen. In the desktop app (Tauri) everything is read from / written
 *  to the local database through Rust commands — there is no web server behind the bundled UI,
 *  so `/api/*` does not exist there. In the browser the same functions call the web API. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getProducts() {
  if (isTauri()) return invoke<any[]>("get_cached_data", { kind: "products" });
  const r = await fetch("/api/products");
  const d = await r.json();
  return d.products ?? [];
}

export async function getTables() {
  if (isTauri()) return invoke<any[]>("get_cached_data", { kind: "tables" });
  const r = await fetch("/api/tables");
  const d = await r.json();
  return d.tables ?? [];
}

export async function getAreas() {
  if (isTauri()) return invoke<any[]>("get_cached_data", { kind: "areas" });
  const r = await fetch("/api/delivery-areas");
  const d = await r.json();
  return d.areas ?? [];
}

/** Same shape as GET /api/settings: { restaurant, settings }. */
export async function getSettings(): Promise<{ restaurant?: any; settings?: any }> {
  if (isTauri()) return invoke("get_cached_data", { kind: "settings" });
  const r = await fetch("/api/settings");
  return r.json();
}

export async function getPaymentMethods(): Promise<{ id?: string; name: string }[]> {
  if (isTauri()) return invoke("get_cached_data", { kind: "payment_methods" });
  const r = await fetch("/api/payment-methods");
  const d = await r.json();
  return d.methods ?? [];
}

export async function searchCustomers(q: string) {
  if (isTauri()) return invoke<any[]>("search_local_customers", { q });
  const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  return d.customers ?? [];
}

export type SaleResult = {
  ok: boolean;
  error?: string;
  orderNo?: number | string;
  total?: number;
  balance?: number;
  /** true when the sale was only saved on this device and will upload on the next sync */
  offline?: boolean;
};

/** `payload.clientSaleId` makes the upload idempotent: re-sending the same id never creates a
 *  second sale. `localTotal` is only used on the desktop, where the server hasn't computed it yet. */
export async function submitSale(payload: Record<string, unknown>, localTotal: number, paid: number): Promise<SaleResult> {
  if (isTauri()) {
    try {
      const r = await invoke<{ orderNo: string; offline: boolean }>("create_local_sale", { payload: { ...payload, total: localTotal } });
      return { ok: true, orderNo: r.orderNo, offline: r.offline, total: localTotal, balance: Math.max(0, localTotal - paid) };
    } catch (e) {
      return { ok: false, error: typeof e === "string" ? e : e instanceof Error ? e.message : "Could not save the sale" };
    }
  }
  const r = await fetch("/api/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) return { ok: false, error: d.error || "Checkout failed" };
  return { ok: true, orderNo: d.orderNo, total: d.total, balance: d.balance ?? 0 };
}
