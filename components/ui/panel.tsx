import { initials, colorForId } from "@/lib/avatar";
import { LoadingOverlay } from "@/components/ui/loading";

/** Panel shell — 1:1 with the prototype's .panel > .panel-head + table-scroll.
 *  `loading` shows a blocking overlay (see LoadingOverlay) over the whole panel — pass the
 *  same `loading`/`saving` state the page already tracks for its initial fetch or a
 *  destructive/bulk action, so the table underneath can't be misclicked mid-update. */
export function Panel({ children, loading = false, loadingLabel }: { children: React.ReactNode; loading?: boolean; loadingLabel?: string }) {
  return (
    <div className="relative rounded-xl border border-line bg-surface">
      {children}
      <LoadingOverlay show={loading} label={loadingLabel} />
    </div>
  );
}

export function PanelHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-ink-strong">{title}</h3>
        {subtitle && <div className="text-xs text-ink-mid mt-0.5">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export const searchInputCls =
  "rounded-md bg-raised border border-line px-3 py-2 text-sm w-56 placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chili-500";
export const addBtnCls =
  "inline-flex items-center gap-1.5 rounded-lg bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-3.5 py-2 transition whitespace-nowrap";

export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-mid whitespace-nowrap">{children}</th>;
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm align-middle ${className}`}>{children}</td>;
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-faint">
        {label}
      </td>
    </tr>
  );
}

/** emp-avatar equivalent — deterministic color + initials, shared across Customers/
 *  Suppliers/Employees profile rows and headers. */
export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, background: colorForId(id), fontSize: size * 0.34 }}
    >
      {initials(name)}
    </div>
  );
}

export function Badge({ children, tone = "steel" }: { children: React.ReactNode; tone?: "steel" | "basil" | "crimson" | "turmeric" }) {
  const tones: Record<string, string> = {
    steel: "bg-raised text-ink-mid border-line",
    basil: "bg-basil-500/10 text-basil-400 border-basil-500/30",
    crimson: "bg-crimson-500/10 text-crimson-400 border-crimson-500/30",
    turmeric: "bg-turmeric-500/10 text-turmeric-400 border-turmeric-500/30",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function IconBtn({
  onClick,
  title,
  children,
  disabled = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-mid transition hover:bg-raised hover:text-ink-strong disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

export function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-ink-mid mb-1">{label}</div>
      <div className="font-display text-xl font-semibold text-ink-strong">{value}</div>
    </div>
  );
}
