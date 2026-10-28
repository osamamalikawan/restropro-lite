"use client";
import { useEffect, useRef, useState } from "react";

/** Small dependency-free SVG charts for the Dashboard (a line chart and a grouped column chart).
 *  They follow the app theme (light/dark) through the CSS variables and resize with their container. */

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** A round-ish top for the Y axis and 4 evenly spaced ticks. */
function niceScale(max: number) {
  if (max <= 0) return { top: 100, ticks: [0, 25, 50, 75, 100] };
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

const AXIS = { stroke: "rgb(var(--line))" };
const TXT = { fill: "rgb(var(--ink-faint))", fontSize: 11 };
const H = 250;
const PAD = { l: 46, r: 12, t: 12, b: 26 };

export type LineSeries = { name: string; color: string; values: (number | null)[]; dashed?: boolean };

export function LineChart({ labels, series, tickEvery = 3 }: { labels: string[]; series: LineSeries[]; tickEvery?: number }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(w - PAD.l - PAD.r, 10);
  const innerH = H - PAD.t - PAD.b;
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const { top, ticks } = niceScale(max);
  const x = (i: number) => PAD.l + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;

  function path(vals: (number | null)[]) {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD.l) / innerW;
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round(rel * (labels.length - 1)))));
  }

  return (
    <div ref={ref} className="relative w-full select-none">
      {w > 0 && (
        <svg width={w} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} {...AXIS} strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" {...TXT}>
                {compact(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % tickEvery === 0 ? (
              <text key={i} x={x(i)} y={H - 8} textAnchor="middle" {...TXT}>
                {l}
              </text>
            ) : null
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} {...AXIS} />}
          {series.map((s) => (
            <g key={s.name}>
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "6 5" : undefined} />
              {hover != null && s.values[hover] != null && <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="rgb(var(--bg-surface))" strokeWidth={2} />}
            </g>
          ))}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[120px] rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 60, 4), Math.max(w - 132, 4)) }}
        >
          <div className="mb-1 font-semibold text-ink-strong">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-ink-mid">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="font-mono font-semibold text-ink-strong">{s.values[hover] == null ? "—" : money(s.values[hover]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type ColumnSeries = { name: string; color: string; values: (number | null)[] };

export function ColumnChart({ labels, series, tickEvery = 1 }: { labels: string[]; series: ColumnSeries[]; tickEvery?: number }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = Math.max(w - PAD.l - PAD.r, 10);
  const innerH = H - PAD.t - PAD.b;
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const { top, ticks } = niceScale(max);
  const group = innerW / labels.length;
  const barW = Math.max(Math.min((group * 0.72) / series.length, 26), 2);
  const y = (v: number) => PAD.t + innerH - (v / top) * innerH;

  return (
    <div ref={ref} className="relative w-full select-none">
      {w > 0 && (
        <svg width={w} height={H} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} {...AXIS} strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" {...TXT}>
                {compact(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => {
            const cx = PAD.l + group * i + group / 2;
            const start = cx - (barW * series.length) / 2;
            return (
              <g key={i} onPointerMove={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect x={PAD.l + group * i} y={PAD.t} width={group} height={innerH} fill={hover === i ? "rgb(var(--bg-hover))" : "transparent"} opacity={0.6} />
                {series.map((s, k) => {
                  const v = s.values[i];
                  if (v == null) return null;
                  const h = Math.max((v / top) * innerH, v > 0 ? 2 : 0);
                  return <rect key={s.name} x={start + k * barW} y={PAD.t + innerH - h} width={barW - 1} height={h} rx={Math.min(3, barW / 2)} fill={s.color} />;
                })}
                {i % tickEvery === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" {...TXT}>
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[130px] rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(PAD.l + group * hover + group / 2 - 65, 4), Math.max(w - 142, 4)) }}
        >
          <div className="mb-1 font-semibold text-ink-strong">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-ink-mid">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="font-mono font-semibold text-ink-strong">{s.values[hover] == null ? "—" : money(s.values[hover]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mid">
      {items.map((i) => (
        <span key={i.name} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color, opacity: i.dashed ? 0.7 : 1 }} />
          {i.name}
        </span>
      ))}
    </div>
  );
}
