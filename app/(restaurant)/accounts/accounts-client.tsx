"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Equal, FileDown } from "lucide-react";
import { Panel, PanelHead, TableScroll, Th, Td, EmptyRow, KpiCard, searchInputCls } from "@/components/ui/panel";
import { DateRange, rangeToQuery } from "@/components/ui/date-range";
import { fmtMoney } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";
import { useDebounced } from "@/components/ui/load-more";
import { buildTablePdf, downloadPdf } from "@/lib/simple-pdf";

type MenuProduct = { id: string; name: string; name_ur?: string | null };
type Sold = { productId: string | null; name: string; quantity: number; total: number };
type Row = { key: string; name: string; nameUr: string; quantity: number; total: number };

/** Accounts: income / expense totals for the date range, and for every menu product how many were sold and
 *  the amount. Products with no sales in the range are listed with 0. */
export function AccountsClient() {
  const [totals, setTotals] = useState({ income: 0, expense: 0, net: 0 });
  const [menu, setMenu] = useState<MenuProduct[] | null>(null);
  const [sold, setSold] = useState<Sold[] | null>(null);
  const [from, setFrom] = useState(""); // local date+time strings from the range boxes
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 200);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const latest = useRef(0); // ignores a slow answer that a newer date range has already replaced

  // the menu doesn't depend on the date range
  useEffect(() => {
    (async () => {
      const res = await fetchJson<{ products: MenuProduct[] }>("/api/products");
      if (res.ok) setMenu(res.data?.products ?? []);
      else setError(res.error);
    })();
  }, []);

  useEffect(() => {
    const id = ++latest.current;
    setSold(null);
    (async () => {
      const range = rangeToQuery(from, to, true);
      const soldRes = await fetchJson<{ products: Sold[] }>(`/api/accounts/products?${new URLSearchParams(range)}`);
      const totalsRes = await fetchJson<{ totals?: { income: number; expense: number; net: number } }>(`/api/accounts?${new URLSearchParams({ limit: "1", offset: "0", ...range })}`);
      if (id !== latest.current) return;
      if (!soldRes.ok) {
        setError(soldRes.error);
        setSold([]);
        return;
      }
      setError("");
      setSold(soldRes.data?.products ?? []);
      if (totalsRes.ok && totalsRes.data?.totals) setTotals(totalsRes.data.totals);
    })();
  }, [from, to]);

  const rows: Row[] = useMemo(() => {
    if (sold === null) return [];
    const byId = new Map<string, Sold>();
    const loose: Sold[] = []; // sold lines with no product id (or a product that's no longer on the menu)
    for (const s of sold) {
      if (s.productId) byId.set(s.productId, s);
      else loose.push(s);
    }
    const out: Row[] = [];
    const used = new Set<string>();
    for (const m of menu ?? []) {
      const s = byId.get(m.id);
      if (s) used.add(m.id);
      out.push({ key: m.id, name: m.name, nameUr: (m.name_ur ?? "").trim(), quantity: s?.quantity ?? 0, total: s?.total ?? 0 });
    }
    for (const s of byId.values()) if (!used.has(s.productId as string)) loose.push(s);
    loose.forEach((s, i) => out.push({ key: `x${i}-${s.name}`, name: s.name, nameUr: "", quantity: s.quantity, total: s.total }));
    return out.sort((a, b) => b.total - a.total || b.quantity - a.quantity || a.name.localeCompare(b.name));
  }, [menu, sold]);

  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.nameUr.toLowerCase().includes(q)) : rows;
  const totalQty = shown.reduce((n, r) => n + r.quantity, 0);
  const totalAmount = shown.reduce((n, r) => n + r.total, 0);
  const loading = sold === null || menu === null;
  const { income, expense } = totals;

  function exportPdf() {
    setExporting(true);
    try {
      const when = (v: string) => new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
      const period = from || to ? `Period: ${from ? when(from) : "the beginning"} to ${to ? when(to) : "now"}` : "Period: all dates";
      const bytes = buildTablePdf({
        title: "Product sales",
        lines: [period, `Generated: ${when(new Date().toISOString())}`],
        summary: [
          { label: "Items sold", value: totalQty.toLocaleString() },
          { label: "Total amount", value: fmtMoney(totalAmount) },
        ],
        columns: [
          { header: "Product", width: 420 },
          { header: "Quantity sold", width: 150, align: "right" },
          { header: "Total amount", width: 192, align: "right" },
        ],
        rows: shown.map((r) => [r.nameUr ? `${r.name} / ${r.nameUr}` : r.name, String(r.quantity), fmtMoney(r.total)]),
        note: `${shown.length} ${shown.length === 1 ? "product" : "products"}`,
      });
      downloadPdf(bytes, `product-sales-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      setError(`Couldn't create the PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <KpiCard label="Total income" value={<span className="flex items-center gap-1.5 text-basil-400"><ArrowUp className="h-4 w-4" />{fmtMoney(income)}</span>} />
        <KpiCard label="Total expense" value={<span className="flex items-center gap-1.5 text-crimson-400"><ArrowDown className="h-4 w-4" />{fmtMoney(expense)}</span>} />
        <KpiCard label="Net income" value={<span className="flex items-center gap-1.5"><Equal className="h-4 w-4" />{fmtMoney(income - expense)}</span>} />
      </div>

      <Panel loading={loading}>
        <PanelHead title="Product sales" subtitle="How many of each menu product were sold, and the amount, for the selected date range">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product…" className={searchInputCls} />
          <button
            onClick={exportPdf}
            disabled={exporting || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-2 text-sm font-semibold text-ink-mid transition-colors hover:border-chili-500/60 hover:text-ink-strong disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? "Creating PDF…" : "PDF"}
          </button>
        </PanelHead>
        <DateRange from={from} to={to} withTime shiftPreset onChange={(f, t) => { setFrom(f); setTo(t); }} />
        {error && <p className="mx-5 mt-4 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">Couldn&apos;t load: {error}</p>}
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                <Th>Product</Th>
                <Th>Quantity sold</Th>
                <Th>Total amount</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className={`border-b border-line last:border-0 ${r.quantity === 0 ? "opacity-55" : ""}`}>
                  <Td className="font-medium text-ink-strong">
                    <span dir="auto">{r.name}</span>
                    {r.nameUr && (
                      <span dir="rtl" lang="ur" className="ml-2 text-base text-ink-mid">
                        {r.nameUr}
                      </span>
                    )}
                  </Td>
                  <Td className="font-mono">{r.quantity.toLocaleString()}</Td>
                  <Td className="font-mono font-medium">{fmtMoney(r.total)}</Td>
                </tr>
              ))}
              {!loading && !error && shown.length === 0 && <EmptyRow colSpan={3} label={q ? "No product matches this search." : "No menu products yet."} />}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-raised/50 font-semibold">
                  <Td>Total</Td>
                  <Td className="font-mono">{totalQty.toLocaleString()}</Td>
                  <Td className="font-mono">{fmtMoney(totalAmount)}</Td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableScroll>
      </Panel>
    </main>
  );
}
