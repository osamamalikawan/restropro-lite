"use client";
import { useEffect, useState } from "react";
import { PageLoader } from "@/components/ui/loading";
import { DollarSign, TrendingUp, Receipt, Layers } from "lucide-react";
import { ColumnChart, LineChart, Legend } from "@/components/dashboard-charts";

type Summary = {
  salesTotal: number;
  salesCount: number;
  expensesToday: number;
  inventoryValue: number;
  inventoryCount: number;
  lowStockCount: number;
  unpaidCount: number;
  unpaidDue: number;
  activeEmployees: number;
  topProducts: { name: string; qty: number }[];
};

type PeriodSeries = { labels: string[]; current: (number | null)[]; previous: (number | null)[]; currentTotal: number; previousToDate: number; previousTotal: number };
type Charts = {
  hourNow: number;
  today: (number | null)[];
  yesterday: number[];
  todayTotal: number;
  yesterdayTotal: number;
  yesterdayToNow: number;
  week: PeriodSeries;
  month: PeriodSeries & { monthName: string };
};

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`);
const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const CHILI = "#D9481F";
const MUTED = "#8c8072";

/** "▲ 12% vs last week" — green when up, red when down. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before <= 0) return <span className="text-xs text-ink-faint">{now > 0 ? `${money(now)} — nothing to compare with ${label} yet` : `No sales yet`}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-basil-400" : "text-crimson-400"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-ink-faint">vs {label}</span>
    </span>
  );
}

/** Matches the prototype's renderDashboard() KPI cards + top-products list, plus the sales charts
 *  (today vs yesterday, weekly / monthly progress). Gross Profit and Supplier Payable aren't included — see migration 0011's comment
 *  for why those two specifically were left for later. */
export function DashboardHomeClient({ employeeName, role }: { employeeName: string; role: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [chartsError, setChartsError] = useState(false);
  const [lineMode, setLineMode] = useState<"hourly" | "running">("hourly");
  const [period, setPeriod] = useState<"week" | "month">("week");

  function reload() {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setSummary(d.summary));
    // the browser's own clock decides what "today" means (minutes ahead of UTC)
    fetch(`/api/dashboard/charts?tz=${-new Date().getTimezoneOffset()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setCharts(d);
        setChartsError(false);
      })
      .catch(() => setChartsError(true));
  }

  useEffect(() => {
    reload();
  }, []);

  if (!summary) {
    return (
      <main className="p-6 md:p-8">
        <PageLoader label="Loading dashboard…" />
      </main>
    );
  }

  const avgOrder = summary.salesCount ? summary.salesTotal / summary.salesCount : 0;
  const topMax = summary.topProducts[0]?.qty || 1;

  const running = (vals: (number | null)[]) => {
    let acc = 0;
    return vals.map((v) => (v == null ? null : (acc += v)));
  };
  const lineToday = charts ? (lineMode === "hourly" ? charts.today : running(charts.today)) : [];
  const lineYesterday = charts ? (lineMode === "hourly" ? charts.yesterday : running(charts.yesterday)) : [];
  const per = charts ? (period === "week" ? charts.week : charts.month) : null;
  const perLabel = period === "week" ? "last week" : "last month";
  const thisName = period === "week" ? "This week" : charts?.month.monthName ?? "This month";

  const net = summary.salesTotal - summary.expensesToday;
  const kpis = [
    { label: "Today's sales", value: `Rs ${summary.salesTotal.toLocaleString()}`, delta: `${summary.salesCount} orders`, color: "#D9481F", Icon: DollarSign },
    { label: "Avg order value", value: `Rs ${Math.round(avgOrder).toLocaleString()}`, delta: "per order", color: "#C99A3E", Icon: TrendingUp },
    { label: "Expenses today", value: `Rs ${summary.expensesToday.toLocaleString()}`, delta: "logged today", color: "#B7383F", Icon: Receipt },
    { label: "Sales minus expenses", value: `Rs ${net.toLocaleString()}`, delta: "today", color: net >= 0 ? "#3F6E52" : "#B7383F", Icon: Layers },
  ];

  return (
    <main className="p-6 md:p-8">
      <p className="text-ink-faint text-sm mb-5">
        Signed in as {employeeName} <span className="capitalize">({role})</span>
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ background: `${k.color}22`, color: k.color }}
            >
              <k.Icon size={17} />
            </div>
            <div className="text-xs text-ink-faint mb-1">{k.label}</div>
            <div className="font-display text-xl font-semibold text-ink-strong">{k.value}</div>
            <div className="text-xs mt-0.5" style={{ color: k.color }}>
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-line bg-surface p-4">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-semibold text-sm text-ink-strong">Today vs yesterday</h3>
              {charts && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-mono text-sm font-semibold text-ink-strong">{money(charts.todayTotal)}</span>
                  <Delta now={charts.todayTotal} before={charts.yesterdayToNow} label="yesterday at this time" />
                </div>
              )}
            </div>
            <div className="flex rounded-lg border border-line bg-raised p-0.5 text-xs font-semibold">
              {(["hourly", "running"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLineMode(m)}
                  className={`rounded-md px-3 py-1 transition-colors ${lineMode === m ? "bg-chili-500 text-white" : "text-ink-mid hover:text-ink-strong"}`}
                >
                  {m === "hourly" ? "Hourly" : "Running total"}
                </button>
              ))}
            </div>
          </div>
          {charts ? (
            <>
              <div className="mb-1">
                <Legend
                  items={[
                    { name: `Today (${money(charts.todayTotal)})`, color: CHILI },
                    { name: `Yesterday (${money(charts.yesterdayTotal)})`, color: MUTED, dashed: true },
                  ]}
                />
              </div>
              <LineChart
                labels={HOUR_LABELS}
                series={[
                  { name: "Yesterday", color: MUTED, values: lineYesterday, dashed: true },
                  { name: "Today", color: CHILI, values: lineToday },
                ]}
              />
            </>
          ) : (
            <p className="py-16 text-center text-sm text-ink-faint">{chartsError ? "Charts need an internet connection — they will appear when you're back online." : "Loading chart…"}</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="font-display font-semibold text-sm text-ink-strong mb-3">Top products</h3>
          {summary.topProducts.length === 0 ? (
            <p className="text-xs text-ink-faint">No sales yet — ring up an order in POS to see your top sellers.</p>
          ) : (
            <div className="space-y-2.5">
              {summary.topProducts.map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ink-mid">{p.name}</span>
                    <span className="font-mono font-semibold text-ink-strong">{p.qty}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-raised overflow-hidden">
                    <div className="h-full bg-chili-500 rounded-full" style={{ width: `${Math.round((p.qty / topMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-surface p-4">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-sm text-ink-strong">{period === "week" ? "Weekly progress" : "Monthly progress"}</h3>
            {per && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="font-mono text-sm font-semibold text-ink-strong">{money(per.currentTotal)}</span>
                <Delta now={per.currentTotal} before={per.previousToDate} label={`${perLabel} (same days)`} />
              </div>
            )}
          </div>
          <div className="flex rounded-lg border border-line bg-raised p-0.5 text-xs font-semibold">
            {(["week", "month"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPeriod(m)}
                className={`rounded-md px-3 py-1 transition-colors ${period === m ? "bg-chili-500 text-white" : "text-ink-mid hover:text-ink-strong"}`}
              >
                {m === "week" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
        {per ? (
          <>
            <div className="mb-1">
              <Legend
                items={[
                  { name: `${thisName} (${money(per.currentTotal)})`, color: CHILI },
                  { name: `${period === "week" ? "Last week" : "Last month"} (${money(per.previousTotal)})`, color: MUTED },
                ]}
              />
            </div>
            <ColumnChart
              labels={per.labels}
              tickEvery={period === "week" ? 1 : 2}
              series={[
                { name: thisName, color: CHILI, values: per.current },
                { name: period === "week" ? "Last week" : "Last month", color: MUTED, values: per.previous },
              ]}
            />
          </>
        ) : (
          <p className="py-16 text-center text-sm text-ink-faint">{chartsError ? "Charts need an internet connection — they will appear when you're back online." : "Loading chart…"}</p>
        )}
      </div>
    </main>
  );
}
