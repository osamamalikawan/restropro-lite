"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Equal, Hourglass, FileDown } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, Badge, KpiCard, addBtnCls, searchInputCls } from "@/components/ui/panel";
import { DateRange, rangeToQuery } from "@/components/ui/date-range";
import { fmtMoney, fmtDateTime, todayISO } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { LoadMore, useDebounced } from "@/components/ui/load-more";
import { buildTablePdf, downloadPdf } from "@/lib/simple-pdf";

type AccountEntry = { id: string; txn_date: string; created_at?: string; description: string; category: string; type: "income" | "expense"; amount: number };
type Supplier = { id: string };
type Purchase = { supplier_id: string | null; total_cost: number };
type LedgerEntry = { supplier_id: string; amount: number };
const PAGE = 50;

export function AccountsClient() {
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0, net: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [from, setFrom] = useState(""); // local date+time strings from the range boxes
  const [to, setTo] = useState("");
  const latest = useRef(0); // ignores a slow answer that a newer search/filter has already replaced
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [fType, setFType] = useState<"income" | "expense">("income");
  const [fCategory, setFCategory] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fDate, setFDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);

  /** Fetches one page of the ledger for the current search + date range. offset 0 starts over. */
  async function loadPage(offset: number) {
    const id = latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset), ...rangeToQuery(from, to, true) });
    if (q) params.set("q", q);
    const res = await fetchJson<{ accounts: AccountEntry[]; hasMore: boolean; totals?: { income: number; expense: number; net: number } }>(
      `/api/accounts?${params}`
    );
    if (id !== latest.current) return;
    if (!res.ok) {
      setLoadError(res.error);
      if (offset === 0) setEntries([]);
      return;
    }
    setLoadError("");
    setHasMore(!!res.data?.hasMore);
    if (res.data?.totals) setTotals(res.data.totals);
    setEntries((prev) => (offset === 0 ? res.data?.accounts ?? [] : [...prev, ...(res.data?.accounts ?? [])]));
  }

  /** Reload from the first page (new search / range / after saving an entry). */
  async function reload() {
    latest.current += 1;
    setLoading(true);
    setHasMore(false);
    await loadPage(0);
    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPage(entries.length);
    setLoadingMore(false);
  }

  // search / date range changed -> start again from the newest matching entry
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, from, to]);

  // supplier figures don't depend on the ledger filters: load them once
  useEffect(() => {
    (async () => {
      const [sRes, pRes, lRes] = await Promise.all([
        fetchJson<{ suppliers: Supplier[] }>("/api/suppliers"),
        fetchJson<{ purchases: Purchase[] }>("/api/restock?limit=1000"),
        fetchJson<{ entries: LedgerEntry[] }>("/api/supplier-ledger?limit=1000"),
      ]);
      setSuppliers(sRes.ok ? sRes.data?.suppliers ?? [] : []);
      setPurchases(pRes.ok ? pRes.data?.purchases ?? [] : []);
      setLedger(lRes.ok ? lRes.data?.entries ?? [] : []);
    })();
  }, []);

  const { income, expense } = totals;
  const supplierPayable = suppliers.reduce((sum, s) => {
    const purchased = purchases.filter((p) => p.supplier_id === s.id).reduce((x, p) => x + Number(p.total_cost), 0);
    const paid = ledger.filter((l) => l.supplier_id === s.id).reduce((x, l) => x + Number(l.amount), 0);
    return sum + Math.max(0, purchased - paid);
  }, 0);

  // Running balance: the newest row shows the net of the whole selected range, and each older row is
  // that minus everything booked after it. Works page by page, so loading more never changes what
  // is already on screen.
  const withBalance = useMemo(() => {
    let bal = totals.net;
    return entries.map((e) => {
      const row = { ...e, balance: bal };
      bal -= e.type === "income" ? Number(e.amount) : -Number(e.amount);
      return row;
    });
  }, [entries, totals.net]);

  /** PDF of the whole filtered ledger (not just the rows loaded on screen): every page is fetched, newest first,
   *  up to 5,000 entries, with the same running balance as the table. */
  async function exportPdf() {
    setExporting(true);
    setLoadError("");
    try {
      const base = new URLSearchParams({ limit: "200", ...rangeToQuery(from, to, true) });
      if (q) base.set("q", q);
      const all: AccountEntry[] = [];
      let net = totals.net;
      let more = false;
      for (let page = 0; page < 25; page++) {
        const params = new URLSearchParams(base);
        params.set("offset", String(all.length));
        const res = await fetchJson<{ accounts: AccountEntry[]; hasMore: boolean; totals?: { net: number } }>(`/api/accounts?${params}`);
        if (!res.ok) throw new Error(res.error);
        if (page === 0 && res.data?.totals) net = res.data.totals.net;
        all.push(...(res.data?.accounts ?? []));
        more = !!res.data?.hasMore;
        if (!more) break;
      }

      let bal = net;
      const rows = all.map((e) => {
        const row = [
          e.created_at ? fmtDateTime(e.created_at) : e.txn_date,
          e.description,
          e.category,
          e.type === "income" ? "Income" : "Expense",
          `${e.type === "income" ? "+" : "-"}${fmtMoney(e.amount)}`,
          fmtMoney(bal),
        ];
        bal -= e.type === "income" ? Number(e.amount) : -Number(e.amount);
        return row;
      });

      const when = (v: string) => new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
      const period = from || to ? `Period: ${from ? when(from) : "the beginning"} to ${to ? when(to) : "now"}` : "Period: all dates";
      const green: [number, number, number] = [0.09, 0.6, 0.3];
      const red: [number, number, number] = [0.8, 0.2, 0.2];
      const bytes = buildTablePdf({
        title: "Accounts ledger",
        lines: [period, ...(q ? [`Search: "${q}"`] : []), `Generated: ${when(new Date().toISOString())}`],
        summary: [
          { label: "Total income", value: fmtMoney(totals.income), color: green },
          { label: "Total expense", value: fmtMoney(totals.expense), color: red },
          { label: "Net income", value: fmtMoney(totals.net) },
        ],
        columns: [
          { header: "Date", width: 120 },
          { header: "Description", width: 270 },
          { header: "Category", width: 120 },
          { header: "Type", width: 60 },
          { header: "Amount", width: 90, align: "right", color: (_c, r) => (r[3] === "Income" ? green : red) },
          { header: "Balance", width: 102, align: "right" },
        ],
        rows,
        note: more ? `Showing the newest ${all.length} entries - narrow the date range to include the rest.` : `${all.length} ${all.length === 1 ? "entry" : "entries"}`,
      });
      downloadPdf(bytes, `accounts-ledger-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setLoadError(`Couldn't create the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  function openAdd() {
    setFType("income");
    setFCategory("");
    setFDesc("");
    setFAmount("");
    setFDate(todayISO());
    setError("");
    setModalOpen(true);
  }

  async function save() {
    if (!fAmount || !fCategory.trim()) {
      setError("Amount and category are required");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: fDesc.trim() || fCategory.trim(), category: fCategory.trim(), type: fType, amount: Number(fAmount) }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Could not save entry");
      return;
    }
    setModalOpen(false);
    await reload();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total income" value={<span className="flex items-center gap-1.5 text-basil-400"><ArrowUp className="h-4 w-4" />{fmtMoney(income)}</span>} />
        <KpiCard label="Total expense" value={<span className="flex items-center gap-1.5 text-crimson-400"><ArrowDown className="h-4 w-4" />{fmtMoney(expense)}</span>} />
        <KpiCard label="Net income" value={<span className="flex items-center gap-1.5"><Equal className="h-4 w-4" />{fmtMoney(income - expense)}</span>} />
        <KpiCard label="Supplier payable" value={<span className="flex items-center gap-1.5 text-turmeric-500"><Hourglass className="h-4 w-4" />{fmtMoney(supplierPayable)}</span>} />
      </div>

      <Panel loading={loading}>
        <PanelHead title="Ledger" subtitle="Income & expense transactions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description…" className={searchInputCls} />
          <button
            onClick={exportPdf}
            disabled={exporting || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 text-sm font-semibold text-ink-mid transition-colors hover:border-chili-500/60 hover:text-ink-strong disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? "Creating PDF…" : "PDF"}
          </button>
          <button onClick={openAdd} className={addBtnCls}>
            + Add entry
          </button>
        </PanelHead>
        <DateRange from={from} to={to} withTime shiftPreset onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {loadError && (
          <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">
            Couldn&apos;t load the ledger: {loadError}
          </p>
        )}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {withBalance.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td className="text-ink-mid">{e.created_at ? fmtDateTime(e.created_at) : e.txn_date}</Td>
                  <Td className="font-medium text-ink-strong">{e.description}</Td>
                  <Td>
                    <Badge>{e.category}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={e.type === "income" ? "basil" : "crimson"}>{e.type === "income" ? "Income" : "Expense"}</Badge>
                  </Td>
                  <Td className={`font-mono font-medium ${e.type === "income" ? "text-basil-400" : "text-crimson-400"}`}>
                    {e.type === "income" ? "+" : "-"}
                    {fmtMoney(e.amount)}
                  </Td>
                  <Td className="font-mono text-ink-mid">{fmtMoney(e.balance)}</Td>
                </tr>
              ))}
              {!loading && !loadError && withBalance.length === 0 && (
                <EmptyRow colSpan={6} label={q || from || to ? "No entries match this search or date range." : "No ledger entries yet."} />
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
        title="Add ledger entry"
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
        <Field label="Type">
          <select value={fType} onChange={(e) => setFType(e.target.value as "income" | "expense")} className={inputCls}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </Field>
        <Field label="Category">
          <input value={fCategory} onChange={(e) => setFCategory(e.target.value)} className={inputCls} placeholder="e.g. Other income" />
        </Field>
        <Field label="Description (optional)">
          <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Date">
          <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Amount">
          <input value={fAmount} onChange={(e) => setFAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
        </Field>
      </Modal>
    </main>
  );
}
