"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { LoadingOverlay, PageLoader, Spinner } from "@/components/ui/loading";
import { LoadMore, useDebounced } from "@/components/ui/load-more";
import { CancelOrderDialog, cancelledLabel, stageOf } from "@/components/cancel-order-dialog";

const PAGE = 50; // orders per page: 50 load instantly, the rest on scroll / "Load more"

type Sale = {
  id: string;
  order_no: number;
  display_id?: string | null;
  order_type: "dine_in" | "takeaway" | "delivery";
  subtotal: number;
  tax: number;
  total: number;
  delivery_charge: number;
  status: "completed" | "unpaid" | "cancelled";
  kitchen_status: "New" | "Preparing" | "Completed";
  cancelled_stage?: string | null; // active | preparing | completed - where it was when cancelled (migration 0026)
  cancel_note?: string | null;
  cancelled_by_name?: string | null;
  created_at: string;
  customers: { name: string; phone: string } | null;
  tables: { number: string } | null;
  sale_items: { name: string; unit_price: number; quantity: number }[];
  sale_payments: { method: string; amount: number }[];
};

const TYPE_LABEL: Record<Sale["order_type"], string> = { dine_in: "Dine In", takeaway: "Takeaway", delivery: "Delivery" };
const STATUS_STYLE: Record<Sale["status"], string> = {
  completed: "bg-basil-500/20 text-basil-400",
  unpaid: "bg-turmeric-500/20 text-turmeric-400",
  cancelled: "bg-raised text-ink-faint line-through",
};

/** Matches the prototype's Sales view: full order history, newest first, with a search box,
 *  an expandable item list per row, and Cancel (Admin/Manager only — see page.tsx's
 *  canCancel, ported from the prototype's MANAGER_PERMS.sales.cancel). */
export function SalesClient({ canCancel }: { canCancel: boolean }) {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null); // the order the cancel popup is for
  const [cancelError, setCancelError] = useState("");
  const latest = useRef(0); // ignores a slow answer that a newer search has already replaced

  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/sales?${params}`);
      const data = await res.json().catch(() => ({}));
      if (id !== latest.current) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load orders");
        setSales((prev) => prev ?? []);
        return;
      }
      setError("");
      setHasMore(!!data.hasMore);
      setSales((prev) => (offset === 0 ? data.sales ?? [] : [...(prev ?? []), ...(data.sales ?? [])]));
    } catch {
      if (id !== latest.current) return;
      setError("Could not reach the server.");
      setSales((prev) => prev ?? []);
    }
  }

  useEffect(() => {
    latest.current += 1;
    setSales(null);
    setHasMore(false);
    loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function loadMore() {
    if (loadingMore || !hasMore || !sales) return;
    setLoadingMore(true);
    await loadPage(sales.length);
    setLoadingMore(false);
  }

  function askCancel(sale: Sale) {
    setError("");
    setCancelError("");
    setCancelTarget(sale); // the dialog asks for the reason (required once the order is Completed)
  }

  async function cancelSale(note: string) {
    const sale = cancelTarget;
    if (!sale) return;
    setCancelError("");
    setCancellingId(sale.id);
    const res = await fetch("/api/sales/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ saleId: sale.id, note }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCancelError(d.error ?? "Couldn't cancel the order");
      setCancellingId(null);
      return;
    }
    setSales((prev) =>
      (prev ?? []).map((x) => (x.id === sale.id ? { ...x, status: "cancelled", cancelled_stage: d.stage ?? stageOf(sale.kitchen_status), cancel_note: note || null } : x))
    );
    setCancellingId(null);
    setCancelTarget(null);
  }

  const filtered = sales ?? [];

  return (
    <main className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-4 gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer name or phone…"
          className="flex-1 max-w-sm rounded-lg bg-raised border border-line px-3 py-2 text-sm"
        />
        <span className="text-xs text-ink-faint shrink-0">
          {filtered.length}
          {hasMore ? "+" : ""} orders
        </span>
      </div>
      {error && <p className="text-crimson-400 text-sm mb-3">{error}</p>}

      {sales === null ? (
        <PageLoader label="Loading orders…" />
      ) : (
        <div className="relative rounded-xl border border-line bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-raised/50 text-ink-mid text-xs uppercase">
              <tr>
                <th className="text-left p-3">Order</th>
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Payment</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-t border-line">
                    <td className="p-3 font-mono">
                      <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="hover:underline">
                        #{s.display_id ?? s.order_no}
                      </button>
                    </td>
                    <td className="p-3 text-ink-mid">
                      {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="p-3">
                      {TYPE_LABEL[s.order_type]}
                      {s.tables?.number && <span className="text-ink-faint"> · Table {s.tables.number}</span>}
                    </td>
                    <td className="p-3 text-ink-mid">{s.customers?.name ?? "—"}</td>
                    <td className="p-3 text-ink-mid">{s.sale_payments.map((p) => p.method).join(", ") || "—"}</td>
                    <td className="p-3 text-right font-mono">Rs {s.total.toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${s.status === "cancelled" ? "bg-crimson-500/15 text-crimson-400" : `capitalize ${STATUS_STYLE[s.status]}`}`}>
                        {s.status === "cancelled" ? cancelledLabel(s.cancelled_stage) : s.status}
                      </span>
                      {s.status === "cancelled" && s.cancel_note && <div className="mt-1 max-w-[220px] truncate text-[11px] text-ink-faint" title={s.cancel_note}>{s.cancel_note}</div>}
                    </td>
                    <td className="p-3 text-right">
                      {canCancel && s.status !== "cancelled" && (
                        <button
                          onClick={() => askCancel(s)}
                          disabled={cancellingId === s.id}
                          className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-crimson-400 disabled:opacity-50"
                        >
                          {cancellingId === s.id && <Spinner size={11} />}
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr className="border-t border-line-soft bg-raised/30">
                      <td colSpan={8} className="p-3">
                        {s.status === "cancelled" && (
                          <div className="mb-2 text-xs text-crimson-400">
                            {cancelledLabel(s.cancelled_stage)}
                            {s.cancelled_by_name && <span className="text-ink-faint"> · by {s.cancelled_by_name}</span>}
                            {s.cancel_note && <div className="mt-0.5 text-ink-mid">Reason: {s.cancel_note}</div>}
                          </div>
                        )}
                        <div className="text-xs text-ink-mid space-y-0.5">
                          {s.sale_items.map((it, i) => (
                            <div key={i} className="flex justify-between max-w-xs">
                              <span>
                                {it.quantity}× {it.name}
                              </span>
                              <span className="font-mono">Rs {(it.unit_price * it.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-ink-faint">
                    {q ? "No orders match your search." : "No orders yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} />
          <LoadingOverlay show={cancellingId !== null} />
        </div>
      )}
      <CancelOrderDialog
        open={!!cancelTarget}
        orderLabel={String(cancelTarget?.display_id ?? cancelTarget?.order_no ?? "")}
        stage={stageOf(cancelTarget?.kitchen_status)}
        busy={cancellingId !== null}
        error={cancelError}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelSale}
      />
    </main>
  );
}
