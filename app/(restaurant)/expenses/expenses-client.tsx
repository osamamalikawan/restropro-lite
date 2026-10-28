"use client";
import { useEffect, useRef, useState } from "react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, addBtnCls, searchInputCls } from "@/components/ui/panel";
import { DateRange, rangeToQuery } from "@/components/ui/date-range";
import { fmtMoney, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { LoadMore, useDebounced } from "@/components/ui/load-more";

type ExpenseCategory = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type Expense = {
  id: string;
  category: string;
  expense_type: "regular" | "recurring";
  amount: number;
  vendor: string | null;
  description: string | null;
  payment_method: string;
  txn_date: string;
};

const PAGE = 50;

export function ExpensesClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0 }); // for the whole filtered range
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const latest = useRef(0); // ignores a slow answer that a newer search/filter has already replaced
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [fDate, setFDate] = useState(todayISO());
  const [fType, setFType] = useState<"regular" | "recurring">("regular");
  const [fCategory, setFCategory] = useState("");
  const [fVendor, setFVendor] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fMethod, setFMethod] = useState("Cash");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset), ...rangeToQuery(from, to, false) });
    if (q) params.set("q", q);
    const eRes = await fetchJson<{ expenses: Expense[]; hasMore: boolean; total?: number; count?: number }>(`/api/expenses?${params}`);
    if (id !== latest.current) return;
    if (!eRes.ok) {
      setLoadError(eRes.error);
      if (offset === 0) setExpenses([]);
      return;
    }
    setLoadError("");
    setHasMore(!!eRes.data?.hasMore);
    if (eRes.data?.total != null) setSummary({ total: eRes.data.total, count: eRes.data.count ?? 0 });
    setExpenses((prev) => (offset === 0 ? eRes.data?.expenses ?? [] : [...prev, ...(eRes.data?.expenses ?? [])]));
  }

  /** Back to the first page (new search / date range / after logging an expense). */
  async function load() {
    latest.current += 1;
    setLoading(true);
    setHasMore(false);
    await loadPage(0);
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(expenses.length);
    setLoadingMore(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  // the add-expense form's drop-downs don't depend on the filters: load them once
  useEffect(() => {
    (async () => {
      const [cRes, mRes] = await Promise.all([
        fetchJson<{ categories: ExpenseCategory[] }>("/api/expense-categories"),
        fetchJson<{ methods: PaymentMethod[] }>("/api/payment-methods"),
      ]);
      setCategories(cRes.ok ? cRes.data?.categories ?? [] : []);
      setMethods(mRes.ok ? mRes.data?.methods ?? [] : []);
    })();
  }, []);

  function openAdd() {
    setFDate(todayISO());
    setFType("regular");
    setFCategory(categories[0]?.name ?? "");
    setFVendor("");
    setFDesc("");
    setFAmount("");
    setFMethod(methods[0]?.name ?? "Cash");
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fAmount || Number(fAmount) <= 0) {
      setError("Enter an amount");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: fCategory || categories[0]?.name || "Other",
        expenseType: fType,
        amount: Number(fAmount),
        vendor: fVendor.trim() || undefined,
        description: fDesc.trim() || undefined,
        paymentMethod: fMethod,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not log expense");
      return;
    }
    setModalOpen(false);
    await load();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <Panel loading={loading}>
        <PanelHead
          title="Expenses"
          subtitle={
            q || from || to
              ? `${summary.count} expense${summary.count === 1 ? "" : "s"} found · ${fmtMoney(summary.total)}`
              : "Regular and recurring restaurant expenses"
          }
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search category…" className={searchInputCls} />
          <button onClick={openAdd} className={addBtnCls}>
            + Add expense
          </button>
        </PanelHead>
        <DateRange from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load expenses: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Category</Th>
                <Th>Vendor</Th>
                <Th>Description</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td className="text-ink-mid">{e.txn_date}</Td>
                  <Td>
                    <Badge tone={e.expense_type === "recurring" ? "turmeric" : "steel"}>{e.expense_type === "recurring" ? "Recurring" : "Regular"}</Badge>
                  </Td>
                  <Td>{e.category}</Td>
                  <Td className="text-ink-mid">{e.vendor || "—"}</Td>
                  <Td className="text-ink-mid">{e.description || "—"}</Td>
                  <Td className="font-mono font-medium">{fmtMoney(e.amount)}</Td>
                  <Td className="text-ink-mid">{e.payment_method}</Td>
                </tr>
              ))}
              {!loading && !loadError && expenses.length === 0 && (
                <EmptyRow colSpan={7} label={q || from || to ? "No expenses match this search or date range." : "No expenses logged yet."} />
              )}
            </tbody>
          </table>
        </TableScroll>
        <LoadMore hasMore={hasMore} loading={loadingMore} onMore={loadMore} />
      </Panel>

      <Modal
        busy={saving}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add expense"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Date">
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Type">
          <select value={fType} onChange={(e) => setFType(e.target.value as "regular" | "recurring")} className={inputCls}>
            <option value="regular">Regular</option>
            <option value="recurring">Recurring</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <input value={fVendor} onChange={(e) => setFVendor(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description (optional)">
          <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
        </Field>
        <Field label="Payment method">
          <select value={fMethod} onChange={(e) => setFMethod(e.target.value)} className={inputCls}>
            {methods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </main>
  );
}
