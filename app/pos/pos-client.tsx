"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChefHat, Minus, Plus, Printer, Save, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Modal } from "@/components/ui/modal";
import { readFast, pullAndCache, startBackgroundSync } from "@/lib/sync";
import { printSale, type SaleSnapshot } from "@/lib/posPrint";
import { getProducts, getSettings, getPaymentMethods, submitSale, isTauri } from "@/lib/posData";
import { displayName, hexToRgba, isHexColor } from "@/lib/urdu";

/* Restro Pro Lite POS.
 * - Item and category names follow Settings -> "Show item & category names in Urdu" (name_ur, English when missing).
 * - No tables, no order notes / item notes, no tax, no discount.
 * - Checkout is an editable receipt: quantity and unit price are editable, the line total is read-only (qty x price).
 *   Numbers inside a product's "( )" part are treated as a description and can be changed per order.
 *   "Save", "Kitchen print" and "Invoice print" all complete the order (fully paid). */

type CategoryRef = { name: string; name_ur?: string | null; sort_order?: number; color?: string | null };
type Product = {
  id: string;
  name: string;
  name_ur?: string | null;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  menu_categories?: CategoryRef | CategoryRef[] | null;
};
type CartLine = { productId: string; name: string; price: number; qty: number };
type OrderType = "dine_in" | "takeaway" | "delivery";
/** One row of the checkout receipt. Numbers are kept as text while typing. The part of the name written in ( ) is the
 *  description: `parts` is that text split around its numbers (odd positions are the editable numbers). */
type ReceiptLine = {
  productId: string;
  prefix: string; // name before the "("
  suffix: string; // name after the ")"
  parts: string[] | null; // null when the name has no ( ) part
  qty: string;
  price: string;
  total: string; // derived, never typed
};

function splitName(name: string): { prefix: string; suffix: string; parts: string[] | null } {
  const m = name.match(/^([^(]*)\(([^)]*)\)(.*)$/s);
  if (!m) return { prefix: name, suffix: "", parts: null };
  return { prefix: m[1], suffix: m[3], parts: m[2].split(/(\d+(?:\.\d+)?)/) };
}
const composeName = (l: ReceiptLine) => (l.parts ? `${l.prefix}(${l.parts.join("")})${l.suffix}`.replace(/\s+/g, " ").trim() : l.prefix);

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n: number, d = 4) => String(Math.round(n * 10 ** d) / 10 ** d);

const firstCat = (p: Product) => (Array.isArray(p.menu_categories) ? p.menu_categories[0] : p.menu_categories) ?? null;
const categoryOf = (p: Product) => firstCat(p)?.name || "Other";
const categoryOrderOf = (p: Product) => {
  const o = firstCat(p)?.sort_order;
  return typeof o === "number" ? o : Number.MAX_SAFE_INTEGER;
};
const categoryColorOf = (p: Product): string | null => {
  const c = firstCat(p)?.color;
  return isHexColor(c) ? c : null;
};
const categoryUrduOf = (p: Product): string => {
  const u = firstCat(p)?.name_ur;
  return typeof u === "string" ? u.trim() : "";
};

const TYPE_LABEL: Record<OrderType, string> = { dine_in: "Dine in", takeaway: "Takeaway", delivery: "Delivery" };
const TYPE_KITCHEN: Record<OrderType, string> = { dine_in: "Dine In", takeaway: "Take Away", delivery: "Delivery" };
const TYPE_LABEL_UR: Record<OrderType, string> = { dine_in: "ڈائن اِن", takeaway: "ٹیک اوے", delivery: "ڈیلیوری" };
const FIELD =
  "w-full min-w-0 rounded-lg bg-raised border border-line px-3 py-2 text-sm outline-none focus:border-chili-500 transition-colors";
const LABEL = "block text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-1";

const POS_CSS = `
.rp-scroll{scrollbar-width:thin;scrollbar-color:rgb(var(--line)) transparent}
.rp-scroll::-webkit-scrollbar{width:10px;height:10px}
.rp-scroll::-webkit-scrollbar-track{background:transparent}
.rp-scroll::-webkit-scrollbar-thumb{background:rgb(var(--line));border-radius:999px;border:3px solid transparent;background-clip:content-box}
`;

export function PosClient({
  restaurantId,
  restaurantName,
  cashierName,
}: {
  restaurantId: string;
  restaurantName: string;
  cashierName: string;
  withShell?: boolean; // kept so both page variants keep compiling; the lite POS always sits inside the shell
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [profile, setProfile] = useState({ address: "", phone: "", header: "", footer: "", paper: "80", template: "classic", urdu: false });
  const urduOn = profile.urdu;
  const [methods, setMethods] = useState<string[]>(["Cash"]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [brokenImgs, setBrokenImgs] = useState<Record<string, true>>({});

  // checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [coDelivery, setCoDelivery] = useState("");
  const [method, setMethod] = useState("Cash");
  const [busy, setBusy] = useState<"save" | "kitchen" | "print" | null>(null);
  const [error, setError] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{ orderNo: number | string; total: number; offline?: boolean } | null>(null);
  const [printNote, setPrintNote] = useState("");
  const saleIdRef = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    if (isTauri()) {
      // Desktop: the local database (filled by the sync) is the only source; re-read it now and then.
      const loadLocal = async () => {
        const p = await getProducts();
        if (!cancelled) setProducts(p);
      };
      loadLocal().catch(() => {});
      const timer = setInterval(() => loadLocal().catch(() => {}), 20_000);
      stop = () => clearInterval(timer);
    } else {
      (async () => {
        const local = await readFast<Product>("products", restaurantId);
        if (!cancelled) setProducts(local);
        await pullAndCache("products", restaurantId);
        const refreshed = await readFast<Product>("products", restaurantId);
        if (!cancelled) setProducts(refreshed);
      })();
      stop = startBackgroundSync("products", restaurantId);
    }

    const refresh = () => {
      getSettings()
        .then((d) => {
          if (cancelled) return;
          const st = d.settings ?? {};
          setProfile({
            address: d.restaurant?.address ?? "",
            phone: d.restaurant?.phone ?? "",
            header: st.receipt_header ?? "",
            footer: st.receipt_footer ?? "",
            paper: String(st.paper_width ?? "80"),
            template: String(st.receipt_template ?? "classic"),
            urdu: st.urdu_enabled === true,
          });
        })
        .catch(() => {});
      getPaymentMethods()
        .then((m) => {
          const names = m.map((x) => x.name);
          if (cancelled || !names.length) return;
          setMethods((prev) => (prev.join("|") === names.join("|") ? prev : names));
          setMethod((cur) => (names.includes(cur) ? cur : names[0]));
        })
        .catch(() => {});
    };
    refresh();
    const timer = isTauri() ? setInterval(refresh, 20_000) : null;
    return () => {
      cancelled = true;
      stop();
      if (timer) clearInterval(timer);
    };
  }, [restaurantId]);

  // "/" jumps to the search box
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- cart ----
  function addToCart(p: Product) {
    setLastReceipt(null);
    setCart((prev) => {
      const ex = prev.find((l) => l.productId === p.id);
      if (ex) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: p.id, name: displayName(p, urduOn), price: Number(p.price) || 0, qty: 1 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.productId === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }
  function removeLine(id: string) {
    setCart((prev) => prev.filter((l) => l.productId !== id));
  }
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);
  const delivery = orderType === "delivery" ? Number(deliveryCharge) || 0 : 0;
  const cartTotal = subtotal + delivery;

  function resetOrder() {
    setCart([]);
    setCustName("");
    setCustPhone("");
    setCustAddress("");
    setDeliveryCharge("");
    setSheetOpen(false);
  }

  // ---- checkout receipt (editable) ----
  function openCheckout() {
    if (cart.length === 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.(); // don't leave a menu card focused behind the popup
    setError("");
    setLines(
      cart.map((l) => ({ productId: l.productId, ...splitName(l.name), qty: String(l.qty), price: round(l.price), total: round(l.price * l.qty) }))
    );
    setCoDelivery(orderType === "delivery" ? String(delivery) : "");
    setCheckoutOpen(true);
  }
  function editLine(i: number, field: "qty" | "price", value: string) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const next = { ...l, [field]: value };
        next.total = round(num(next.qty) * num(next.price)); // the total is always qty x price
        return next;
      })
    );
  }
  function editDesc(i: number, part: number, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i && l.parts ? { ...l, parts: l.parts.map((t, k) => (k === part ? value : t)) } : l)));
  }
  const liveLines = lines.filter((l) => num(l.qty) > 0);
  const receiptSub = liveLines.reduce((s, l) => s + num(l.total), 0);
  const receiptDelivery = orderType === "delivery" ? num(coDelivery) : 0;
  const receiptTotal = receiptSub + receiptDelivery;

  async function finish(action: "save" | "kitchen" | "print") {
    if (liveLines.length === 0) return setError("The order needs at least one item.");
    if (liveLines.some((l) => num(l.qty) <= 0 || !Number.isInteger(num(l.qty)))) return setError("Quantities must be whole numbers.");
    if (liveLines.some((l) => num(l.price) < 0 || num(l.total) < 0)) return setError("Prices can't be negative.");
    setBusy(action);
    setError("");
    const items = liveLines.map((l) => ({ productId: l.productId, name: composeName(l), price: num(l.price), qty: num(l.qty) }));
    const payments = receiptTotal > 0 ? [{ method, amount: receiptTotal }] : [];
    const snap: SaleSnapshot = {
      restaurantName,
      address: profile.address,
      phone: profile.phone,
      header: profile.header,
      footer: profile.footer,
      paper: profile.paper,
      cashier: cashierName,
      orderTypeLabel: urduOn ? TYPE_LABEL_UR[orderType] : TYPE_LABEL[orderType],
      orderTypeEn: TYPE_KITCHEN[orderType],
      customerName: custName.trim(),
      customerPhone: custPhone.trim(),
      items: items.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
      deliveryAddress: orderType === "delivery" ? custAddress.trim() : "",
      subtotal: receiptSub,
      delivery: receiptDelivery,
      taxLabel: "",
      tax: 0,
      fee: 0,
      total: receiptTotal,
      payments,
      template: profile.template,
      fbr: null,
      urdu: urduOn,
    };
    const result = await submitSale(
      {
        clientSaleId: saleIdRef.current,
        orderType,
        items,
        payments,
        tableId: null,
        areaId: null,
        deliveryCharge: receiptDelivery,
        taxMethod: method,
        customerName: custName.trim() || undefined,
        customerPhone: custPhone.trim() || undefined,
        customerAddress: custAddress.trim() || undefined,
        serviceCharge: 0,
        fbrFee: 0,
        discount: 0,
        discountPercent: 0,
      },
      receiptTotal,
      receiptTotal
    );
    if (!result.ok) {
      setBusy(null);
      setError(result.error || "Could not save the order");
      return;
    }
    saleIdRef.current = crypto.randomUUID(); // a failed attempt keeps its id so a retry can't double-post
    const orderNo = result.orderNo ?? "";
    setLastReceipt({ orderNo, total: receiptTotal, offline: !!result.offline });
    setPrintNote("");
    setBusy(null);
    setCheckoutOpen(false);
    resetOrder();
    if (action !== "save") {
      // "print" = kitchen slip, then the customer invoice. One failing doesn't stop the other.
      const jobs: ("kitchen" | "invoice")[] = action === "kitchen" ? ["kitchen"] : ["kitchen", "invoice"];
      const failed: string[] = [];
      for (const job of jobs) {
        try {
          await printSale(job, snap, orderNo);
        } catch (e) {
          failed.push(`${job === "kitchen" ? "Kitchen slip" : "Invoice"}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (failed.length) setPrintNote(`Order saved, but it didn't print. ${failed.join(" / ")}`);
    }
  }

  // Keyboard: Enter opens checkout on the POS screen; inside the checkout popup Enter does the Kitchen print.
  // (Typing in a field, or a focused button, keeps its normal Enter behavior on the POS screen; the popup
  // ignores key-repeat so holding Enter can't print twice.)
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const openCheckoutRef = useRef(openCheckout);
  openCheckoutRef.current = openCheckout;
  const stateRef = useRef({ checkoutOpen, busy, cartLen: cart.length });
  stateRef.current = { checkoutOpen, busy, cartLen: cart.length };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName ?? "";
      const st = stateRef.current;
      if (st.checkoutOpen) {
        if (st.busy !== null || tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA") return; // a focused button keeps its own Enter
        e.preventDefault();
        finishRef.current("kitchen");
      } else if (st.cartLen > 0 && !/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && (tag !== "BUTTON" || t?.closest("[data-pos-card]"))) {
        // (after tapping a product its card keeps focus: Enter must open checkout, not add it again)
        e.preventDefault();
        openCheckoutRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- menu view ----
  const available = useMemo(() => (products ?? []).filter((p) => p.is_available !== false), [products]);
  const categories = useMemo(() => {
    const order = new Map<string, number>();
    for (const p of available) order.set(categoryOf(p), Math.min(order.get(categoryOf(p)) ?? Number.MAX_SAFE_INTEGER, categoryOrderOf(p)));
    return Array.from(order.keys()).sort((a, b) =>
      a === "Other" ? 1 : b === "Other" ? -1 : order.get(a)! - order.get(b)! || a.localeCompare(b)
    );
  }, [available]);
  const catColors = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of available) {
      const c = categoryColorOf(p);
      if (!m.has(categoryOf(p)) || (c && !m.get(categoryOf(p)))) m.set(categoryOf(p), c);
    }
    return m;
  }, [available]);
  const catUrdu = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of available) {
      const u = categoryUrduOf(p);
      if (u && !m.has(categoryOf(p))) m.set(categoryOf(p), u);
    }
    return m;
  }, [available]);
  const activeColor = category === "All" ? null : catColors.get(category) ?? null;
  const q = search.trim().toLowerCase();
  const visible = available.filter(
    (p) => (category === "All" || categoryOf(p) === category) && (!q || p.name.toLowerCase().includes(q) || (p.name_ur ?? "").toLowerCase().includes(q))
  );
  const qtyInCart = (id: string) => cart.find((l) => l.productId === id)?.qty ?? 0;

  const orderPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-base font-semibold">Current order</h2>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button onClick={resetOrder} className="text-xs text-ink-faint hover:text-crimson-400">
              Clear
            </button>
          )}
          <button onClick={() => setSheetOpen(false)} aria-label="Close order" className="md:hidden text-ink-mid">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-4 pt-3">
        {(Object.keys(TYPE_LABEL) as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors ${
              orderType === t ? "border-chili-500 bg-chili-500/15 text-chili-400" : "border-line bg-raised text-ink-mid hover:border-chili-500/60"
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {orderType === "delivery" && (
        <div className="space-y-2 px-4 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={LABEL}>Name</span>
              <input value={custName} onChange={(e) => setCustName(e.target.value)} className={FIELD} />
            </div>
            <div>
              <span className={LABEL}>Phone</span>
              <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} className={FIELD} />
            </div>
          </div>
          <div>
            <span className={LABEL}>Address</span>
            <input value={custAddress} onChange={(e) => setCustAddress(e.target.value)} className={FIELD} />
          </div>
          <div>
            <span className={LABEL}>Delivery charge (Rs)</span>
            <input type="number" min="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} className={FIELD} />
          </div>
        </div>
      )}

      <div className="rp-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">Tap an item to start an order</p>
        ) : (
          <ul className="space-y-2">
            {cart.map((l) => (
              <li key={l.productId} className="rounded-lg border border-line bg-raised p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span dir="auto" className="min-w-0 flex-1 text-base font-semibold leading-snug">
                    {l.name}
                  </span>
                  <button onClick={() => removeLine(l.productId)} aria-label="Remove" className="text-ink-faint hover:text-crimson-400">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(l.productId, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:border-chili-500">
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-mono text-sm">{l.qty}</span>
                    <button onClick={() => changeQty(l.productId, 1)} className="grid h-7 w-7 place-items-center rounded-md border border-line hover:border-chili-500">
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-mono text-sm font-semibold">Rs {fmt(l.price * l.qty)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        {delivery > 0 && (
          <div className="mb-1 flex justify-between text-sm text-ink-mid">
            <span>Delivery</span>
            <span className="font-mono">Rs {fmt(delivery)}</span>
          </div>
        )}
        <div className="mb-3 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span className="font-mono">Rs {fmt(cartTotal)}</span>
        </div>
        <button
          onClick={openCheckout}
          disabled={cart.length === 0}
          className="w-full rounded-xl bg-chili-500 py-3 text-base font-bold text-white transition hover:bg-chili-600 disabled:opacity-40"
        >
          Checkout <kbd className="ml-1 rounded border border-white/40 px-1 text-[10px] font-normal opacity-80">Enter</kbd>
        </button>
      </div>
    </div>
  );

  return (
    <main className="h-[calc(100dvh-4rem)] bg-canvas text-ink-strong flex flex-col md:flex-row overflow-hidden">
      <style>{POS_CSS}</style>

      {/* ================= menu ================= */}
      <div className="rp-scroll flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-5 pb-24 md:pb-5">
        {lastReceipt && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-basil-500/40 bg-basil-500/10 px-4 py-2.5 text-sm text-basil-400">
            <span>
              Order #{lastReceipt.orderNo} completed - Rs {fmt(lastReceipt.total)}
              {lastReceipt.offline && " - saved on this device, uploads when online"}
              {printNote && <span className="mt-0.5 block text-turmeric-400">{printNote}</span>}
            </span>
            <button onClick={() => setLastReceipt(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearch("");
              if (e.key === "Enter" && visible.length === 1) {
                addToCart(visible[0]);
                setSearch("");
              }
            }}
            placeholder="Search menu…  ( / )"
            aria-label="Search menu"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-chili-500"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center text-ink-faint hover:text-ink-strong">
              <X size={14} />
            </button>
          )}
        </div>

        {categories.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {["All", ...categories].map((c) => {
              const col = c === "All" ? null : catColors.get(c) ?? null;
              const on = category === c;
              const ur = urduOn && c !== "All" ? catUrdu.get(c) : undefined;
              const style = col
                ? on
                  ? { backgroundColor: col, borderColor: col, color: "#fff" }
                  : { backgroundColor: hexToRgba(col, 0.16), borderColor: hexToRgba(col, 0.6) }
                : undefined;
              return (
                <button
                  key={c}
                  data-pos-card
                  onClick={() => setCategory(c)}
                  style={style}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    col ? (on ? "" : "text-ink-strong hover:brightness-110") : on ? "bg-chili-500 border-chili-500 text-white" : "bg-surface border-line text-ink-mid hover:border-chili-500/60"
                  }`}
                >
                  {ur ? (
                    <span dir="rtl" lang="ur" className="block text-base leading-[1.7]">
                      {ur}
                    </span>
                  ) : c === "All" ? (
                    "All"
                  ) : (
                    c
                  )}
                </button>
              );
            })}
          </div>
        )}

        {products === null ? (
          <PageLoader label="Loading menu…" />
        ) : products.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No products yet. Add some from <Link href="/menu" className="underline">Menu</Link>.
          </p>
        ) : (
          <div
            className="grid grid-cols-2 gap-3 transition-colors md:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]"
            style={activeColor ? { backgroundColor: hexToRgba(activeColor, 0.1), padding: 12, borderRadius: 16 } : undefined}
          >
            {visible.map((p) => {
              const inCart = qtyInCart(p.id);
              const showImg = p.image_url && !brokenImgs[p.id];
              const col = categoryColorOf(p);
              const nm = displayName(p, urduOn);
              const urduShown = nm !== p.name;
              return (
                <button
                  key={p.id}
                  data-pos-card
                  onClick={() => addToCart(p)}
                  style={col ? { backgroundColor: hexToRgba(col, 0.16), borderColor: hexToRgba(col, 0.65) } : undefined}
                  className={`group overflow-hidden rounded-xl border text-center transition active:scale-[0.98] ${col ? "hover:brightness-110" : "border-line bg-surface hover:border-chili-500"}`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-raised">
                    {showImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url as string}
                        alt={nm}
                        loading="lazy"
                        onError={() => setBrokenImgs((b) => ({ ...b, [p.id]: true }))}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-raised to-hover font-display text-3xl text-ink-faint">{nm.charAt(0).toUpperCase()}</div>
                    )}
                    {inCart > 0 && (
                      <span className="absolute right-2 top-2 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-chili-500 px-1.5 text-xs font-bold text-white shadow">{inCart}</span>
                    )}
                  </div>
                  <div className="p-3 text-center">
                    <div className={`flex items-center justify-center ${urduShown ? "min-h-[4.9rem]" : "min-h-[3.6rem]"}`}>
                      <span
                        dir={urduShown ? "rtl" : undefined}
                        lang={urduShown ? "ur" : undefined}
                        className={`block w-full text-center text-[1.3rem] font-semibold line-clamp-2 ${urduShown ? "leading-[1.9]" : "leading-snug"}`}
                      >
                        {nm}
                      </span>
                    </div>
                    <div className="mt-1 text-center font-mono text-base font-semibold text-basil-400">Rs {fmt(p.price)}</div>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && <p className="col-span-full text-sm text-ink-faint">{q ? `No items match “${search.trim()}”.` : "Nothing in this category."}</p>}
          </div>
        )}
      </div>

      {/* mobile: sticky cart bar */}
      {cart.length > 0 && !sheetOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur md:hidden">
          <button onClick={() => setSheetOpen(true)} className="flex w-full items-center justify-between rounded-xl bg-chili-500 px-4 py-3 font-bold text-white">
            <span className="flex items-center gap-2">
              <ShoppingBag size={18} /> {itemCount} item(s)
            </span>
            <span className="font-mono">Rs {fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ================= order panel ================= */}
      <aside className={`${sheetOpen ? "fixed inset-0 z-30 bg-surface" : "hidden"} md:static md:block md:w-[340px] md:shrink-0 md:border-l md:border-line md:bg-surface`}>{orderPanel}</aside>

      {/* ================= checkout: editable receipt ================= */}
      <Modal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Checkout"
        width="max-w-2xl"
        busy={busy !== null}
        footer={
          <>
            <button onClick={() => finish("save")} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-raised disabled:opacity-50">
              {busy === "save" ? <Spinner size={14} /> : <Save size={14} />} Save
            </button>
            <button onClick={() => finish("kitchen")} disabled={busy !== null} title="Enter" className="inline-flex items-center gap-1.5 rounded-lg border border-chili-500 px-4 py-2 text-sm font-semibold text-chili-400 hover:bg-chili-500/10 disabled:opacity-50">
              {busy === "kitchen" ? <Spinner size={14} /> : <ChefHat size={14} />} Kitchen print
              <kbd className="rounded border border-chili-500/40 px-1 text-[10px] font-normal opacity-70">Enter</kbd>
            </button>
            <button onClick={() => finish("print")} disabled={busy !== null} title="Prints the kitchen slip and the invoice" className="inline-flex items-center gap-1.5 rounded-lg bg-chili-500 px-4 py-2 text-sm font-semibold text-white hover:bg-chili-600 disabled:opacity-50">
              {busy === "print" ? <Spinner size={14} /> : <Printer size={14} />} Print
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <p className="text-xs text-ink-faint">
          {TYPE_LABEL[orderType]}
          {custName && ` - ${custName}`}. Change a quantity or price, or the numbers in a ( ) description. Saving or printing completes the order.
        </p>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-raised text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="w-20 px-2 py-2 text-right">Qty</th>
                <th className="w-28 px-2 py-2 text-right">Price</th>
                <th className="w-32 px-2 py-2 text-right">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.productId} className="border-b border-line last:border-0">
                  <td dir="auto" className="px-3 py-2">
                    <div className="text-base font-semibold">{`${l.prefix} ${l.suffix}`.trim() || "-"}</div>
                    {l.parts && (
                      <div dir="ltr" className="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink-mid">
                        <span>(</span>
                        {l.parts.map((t, k) =>
                          k % 2 ? (
                            <input
                              key={k}
                              type="number"
                              step="any"
                              value={t}
                              onChange={(e) => editDesc(i, k, e.target.value)}
                              aria-label="Description number"
                              className="w-16 rounded-md border border-line bg-raised px-1.5 py-0.5 text-center font-mono text-sm outline-none focus:border-chili-500"
                            />
                          ) : (
                            <span key={k} dir="auto" className="whitespace-pre">{t}</span>
                          )
                        )}
                        <span>)</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="1" value={l.qty} onChange={(e) => editLine(i, "qty", e.target.value)} className={`${FIELD} text-right font-mono`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="any" value={l.price} onChange={(e) => editLine(i, "price", e.target.value)} className={`${FIELD} text-right font-mono`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input readOnly tabIndex={-1} value={l.total} aria-label="Line total" className={`${FIELD} cursor-default text-right font-mono font-semibold opacity-80`} />
                  </td>
                  <td className="pr-2 text-center">
                    <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove line" className="text-ink-faint hover:text-crimson-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orderType === "delivery" && (
            <div>
              <span className={LABEL}>Delivery charge (Rs)</span>
              <input type="number" min="0" value={coDelivery} onChange={(e) => setCoDelivery(e.target.value)} className={`${FIELD} font-mono`} />
            </div>
          )}
          <div>
            <span className={LABEL}>Payment method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={FIELD}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1 border-t border-dashed border-line pt-3 text-sm">
          <div className="flex justify-between text-ink-mid">
            <span>Subtotal</span>
            <span className="font-mono">Rs {fmt(receiptSub)}</span>
          </div>
          {receiptDelivery > 0 && (
            <div className="flex justify-between text-ink-mid">
              <span>Delivery</span>
              <span className="font-mono">Rs {fmt(receiptDelivery)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="font-mono">Rs {fmt(receiptTotal)}</span>
          </div>
        </div>
      </Modal>
    </main>
  );
}
