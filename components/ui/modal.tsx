"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { Spinner, LoadingOverlay } from "@/components/ui/loading";

/** Standard modal shell — 1:1 with the prototype's components/modal.html
 *  (.overlay > .modal > .modal-head / .modal-body / .modal-foot).
 *  `busy` (pass the page's `saving` state) blocks the body+footer behind a LoadingOverlay
 *  and disables the close (✕) button and backdrop-click-to-close while a save is in
 *  flight, so a misclick can't dismiss the modal or double-submit mid-request. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-md",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className={`w-full ${width} max-h-[90vh] flex flex-col rounded-xl border border-line bg-surface shadow-xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 shrink-0">
          <h3 className="font-display text-lg font-semibold text-ink-strong">{title}</h3>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-mid transition hover:bg-raised hover:text-ink-strong disabled:opacity-40 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative">
          <div className="overflow-y-auto px-5 py-4 space-y-3">{children}</div>
          <LoadingOverlay show={busy} />
        </div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-md bg-raised border border-line px-3 py-2 text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chili-500";
export const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-chili-500 hover:bg-chili-600 text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-50";
export const btnGhost = "inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-sm text-ink-strong transition hover:bg-raised";

/** Drop-in replacement for a plain `<button className={btnPrimary} disabled={saving}>` that
 *  also renders a spinner in place of/alongside the label while `loading` — small enough to
 *  adopt gradually; existing btnPrimary/btnGhost buttons keep working unchanged. */
export function Button({
  loading = false,
  disabled,
  variant = "primary",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "ghost" }) {
  return (
    <button {...rest} disabled={disabled || loading} className={variant === "primary" ? btnPrimary : btnGhost}>
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}
