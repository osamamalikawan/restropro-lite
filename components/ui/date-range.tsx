"use client";
import { useState } from "react";
import { inputCls } from "@/components/ui/modal";

/** Local date/time as the strings the browser inputs use ("2026-10-06" / "2026-10-06T14:30"). */
const p2 = (n: number) => String(n).padStart(2, "0");
const dStr = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dtStr = (d: Date) => `${dStr(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** A "from - to" filter with quick presets. With `withTime` the boxes take a date AND a time
 *  (Accounts); without it, just dates (Expenses). Values are local-time strings; use
 *  rangeToQuery() to turn them into what the API expects.
 *  With `shiftPreset` (Accounts) the "Today" chip becomes "Current shift", following the shift timings set under
 *  Permissions -> "Default shift timings": the shift in progress, or - between two shifts - the one that just ended. */
export function DateRange({
  from,
  to,
  onChange,
  withTime = false,
  shiftPreset = false,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  withTime?: boolean;
  shiftPreset?: boolean;
}) {
  const [note, setNote] = useState(""); // which shift "Current shift" picked, shown under the boxes
  const [loadingShift, setLoadingShift] = useState(false);
  const type = withTime ? "datetime-local" : "date";
  const fmt = withTime ? dtStr : dStr;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);

  async function currentShift() {
    setLoadingShift(true);
    setNote("");
    let w: { kind: string; from: string | null; to: string | null; start?: string; end?: string } | null = null;
    try {
      const r = await fetch(`/api/shifts/current?tz=${-new Date().getTimezoneOffset()}`);
      if (r.ok) w = await r.json();
    } catch {
      /* fall back to the calendar day below */
    }
    setLoadingShift(false);
    if (w?.from && (w.kind === "current" || w.kind === "previous")) {
      const nice = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      const timings = w.start && w.end ? ` (${w.start} - ${w.end})` : "";
      if (w.kind === "current") {
        onChange(fmt(new Date(w.from)), ""); // still running: no end, so entries made from now on show up too
        setNote(`Current shift${timings} - since ${nice(w.from)}`);
      } else {
        onChange(fmt(new Date(w.from)), fmt(new Date(w.to!)));
        setNote(`No shift is running now - showing the previous shift${timings}: ${nice(w.from)} to ${nice(w.to!)}`);
      }
      return;
    }
    const now = new Date();
    onChange(fmt(startOfDay(now)), fmt(endOfDay(now)));
    setNote("Could not read the shift timings - showing today (midnight to midnight)");
  }

  function preset(kind: "today" | "yesterday" | "7d" | "month") {
    setNote("");
    const now = new Date();
    if (kind === "today") onChange(fmt(startOfDay(now)), fmt(endOfDay(now)));
    else if (kind === "yesterday") {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      onChange(fmt(startOfDay(y)), fmt(endOfDay(y)));
    } else if (kind === "7d") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      onChange(fmt(startOfDay(s)), fmt(endOfDay(now)));
    } else onChange(fmt(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0)), fmt(endOfDay(now)));
  }

  const chip =
    "rounded-full border border-line bg-raised px-3 py-1 text-[11px] font-semibold text-ink-mid hover:border-chili-500/60 hover:text-ink-strong";
  const bad = !!from && !!to && from > to;

  return (
    <div className="px-5 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">From</span>
          <input type={type} value={from} max={to || undefined} onChange={(e) => { setNote(""); onChange(e.target.value, to); }} className={`${inputCls} w-auto`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">To</span>
          <input type={type} value={to} min={from || undefined} onChange={(e) => { setNote(""); onChange(from, e.target.value); }} className={`${inputCls} w-auto`} />
        </label>
        <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
          {shiftPreset ? (
            <button type="button" className={chip} onClick={currentShift} disabled={loadingShift}>
              {loadingShift ? "Finding shift…" : "Current shift"}
            </button>
          ) : (
            <button type="button" className={chip} onClick={() => preset("today")}>Today</button>
          )}
          <button type="button" className={chip} onClick={() => preset("yesterday")}>Yesterday</button>
          <button type="button" className={chip} onClick={() => preset("7d")}>Last 7 days</button>
          <button type="button" className={chip} onClick={() => preset("month")}>This month</button>
          {(from || to) && (
            <button type="button" className="px-2 text-[11px] font-semibold text-ink-mid underline hover:text-ink-strong" onClick={() => { setNote(""); onChange("", ""); }}>
              Clear
            </button>
          )}
        </div>
      </div>
      {note && <p className="mt-2 text-xs text-ink-mid">{note}</p>}
      {bad && <p className="mt-2 text-xs text-crimson-400">&quot;From&quot; is after &quot;To&quot;, so nothing can match.</p>}
    </div>
  );
}

/** Turn the local from/to strings into query params. Date+time values become exact UTC instants
 *  (so the filter matches the clock the user sees); date-only values stay as plain dates. */
export function rangeToQuery(from: string, to: string, withTime: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (withTime) {
    if (from) out.from = new Date(from).toISOString();
    if (to) {
      const t = new Date(to);
      t.setSeconds(59, 999); // "to 14:30" includes everything in 14:30
      out.to = t.toISOString();
    }
  } else {
    if (from) out.from = from;
    if (to) out.to = to;
  }
  return out;
}
