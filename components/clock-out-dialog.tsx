"use client";
import { useEffect, useState } from "react";
import { Modal, btnGhost, btnPrimary } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/loading";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { isTauri } from "@/lib/platform";
import { forgetClockIn, getClockInHint } from "@/lib/clock-in-hint";
import { printShiftSlip } from "@/lib/posPrint";

export type ShiftReport = {
  employeeName: string | null;
  clockInAt: string;
  clockOutAt: string;
  durationMinutes: number;
  warning: string | null;
  summary: {
    orders: number;
    salesAmount: number;
    cash: number;
    otherTotal: number;
    other: { method: string; amount: number }[];
    unpaid: number;
    expenses: number;
    expenseCount: number;
  };
};

/** 485 -> "8h 05m", 42 -> "42m" */
export function fmtDuration(mins: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

function Stat({ label, value, sub, strong }: { label: string; value: React.ReactNode; sub?: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${strong ? "border-chili-500/40 bg-chili-500/10" : "border-line bg-raised"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-ink-strong">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

/** "Clock out" confirmation: shows what this person did since they clocked in, and only after they confirm
 *  records the shift and calls `onConfirmed` (which signs them out). If the summary cannot be loaded
 *  (no connection) they can still clock out - signing out is never blocked. */
export function ClockOutDialog({ open, onClose, onConfirmed }: { open: boolean; onClose: () => void; onConfirmed: () => Promise<void> | void }) {
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const hintParam = () => {
    const h = isTauri() ? getClockInHint() : null;
    return h ? `?clockIn=${encodeURIComponent(h)}` : "";
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setReport(null);
    setLoadError("");
    setPrintMsg(null);
    setLoading(true);
    fetch(`/api/staff/shift-summary${hintParam()}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Could not load the shift summary");
        if (alive) setReport(d);
      })
      .catch((e) => alive && setLoadError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Could not reach the server - the summary isn't available right now."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open]);

  /** Same figures as the popup, on the receipt printer (desktop app). */
  async function printSlip() {
    if (!report) return;
    setPrinting(true);
    setPrintMsg(null);
    try {
      let restaurantName = "";
      let paper = "80";
      try {
        const d = await (await fetch("/api/settings")).json();
        restaurantName = d.restaurant?.name ?? "";
        if (d.settings?.paper_width) paper = String(d.settings.paper_width);
      } catch {
        /* print without the restaurant name rather than not at all */
      }
      const s = report.summary;
      await printShiftSlip({
        restaurantName,
        paper,
        employeeName: report.employeeName ?? "",
        clockInAt: report.clockInAt,
        clockOutAt: report.clockOutAt,
        durationText: fmtDuration(report.durationMinutes),
        orders: s.orders,
        salesAmount: s.salesAmount,
        cash: s.cash,
        otherTotal: s.otherTotal,
        other: s.other,
        unpaid: s.unpaid,
        expenses: s.expenses,
      });
      setPrintMsg({ ok: true, text: "Sent to the receipt printer." });
    } catch (e) {
      setPrintMsg({ ok: false, text: `Couldn't print: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setPrinting(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const h = isTauri() ? getClockInHint() : null;
      await fetch("/api/staff/clock-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clockIn: h }),
      });
    } catch {
      /* offline: still sign out */
    }
    forgetClockIn();
    await onConfirmed();
    setBusy(false);
  }

  const s = report?.summary;
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Clock out"
      width="max-w-lg"
      footer={
        <>
          {report && isTauri() && (
            <button onClick={printSlip} disabled={busy || printing} className={`${btnGhost} mr-auto`} title="Print this summary on the receipt printer">
              {printing ? "Printing…" : "Print"}
            </button>
          )}
          <button onClick={onClose} disabled={busy} className={btnGhost}>
            Cancel
          </button>
          <button onClick={confirm} disabled={busy || loading} className={btnPrimary}>
            {busy ? "Clocking out…" : "Confirm clock out"}
          </button>
        </>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-mid">
          <Spinner size={16} /> Loading your shift summary…
        </div>
      )}
      {loadError && !loading && (
        <p className="rounded-lg border border-turmeric-500/30 bg-turmeric-500/10 px-3 py-2 text-xs text-turmeric-400">
          {loadError} You can still clock out.
        </p>
      )}
      {report && s && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-display text-base font-semibold text-ink-strong">{report.employeeName ?? "Your shift"}</div>
            <div className="text-xs text-ink-mid">Total duration: <span className="font-mono font-semibold text-ink-strong">{fmtDuration(report.durationMinutes)}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Clocked in" value={<span className="text-[13px]">{fmtDateTime(report.clockInAt)}</span>} />
            <Stat label="Clocking out" value={<span className="text-[13px]">{fmtDateTime(report.clockOutAt)}</span>} />
            <Stat label="Total sales" value={`${s.orders} order${s.orders === 1 ? "" : "s"}`} />
            <Stat label="Total sale amount" value={fmtMoney(s.salesAmount)} sub={s.unpaid > 0 ? `${fmtMoney(s.unpaid)} still unpaid` : undefined} strong />
            <Stat label="Cash" value={fmtMoney(s.cash)} />
            <Stat
              label="Other accounts"
              value={fmtMoney(s.otherTotal)}
              sub={s.other.length ? s.other.map((o) => `${o.method} ${fmtMoney(o.amount)}`).join(" · ") : "Card, JazzCash, bank…"}
            />
            <div className="col-span-2">
              <Stat label="Expenses" value={fmtMoney(s.expenses)} sub={s.expenseCount ? `${s.expenseCount} expense${s.expenseCount === 1 ? "" : "s"} logged during this shift` : "None logged during this shift"} />
            </div>
          </div>
          {report.warning && <p className="text-[11px] text-turmeric-400">{report.warning}</p>}
          {printMsg && <p className={`text-xs ${printMsg.ok ? "text-basil-400" : "text-crimson-400"}`}>{printMsg.text}</p>}
        </>
      )}
      <p className="text-xs text-ink-faint">Confirming clocks you out and returns to the sign-in screen.</p>
    </Modal>
  );
}
