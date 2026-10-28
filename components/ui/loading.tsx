"use client";

/** Small inline spinner — size in px, color follows currentColor so it drops into buttons
 *  and colored text without extra props. */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The actual misclick guard: an absolutely-positioned layer that sits over whatever it's
 * placed inside (a Panel, a Modal body — the parent needs `relative`), shows a spinner, and
 * — critically — has `pointer-events-auto` so it intercepts clicks on the table/form
 * underneath while a fetch or save is in flight, instead of just visually suggesting
 * "don't click" while silently letting clicks through to stale buttons/rows.
 */
export function LoadingOverlay({ show, label }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-surface/70 backdrop-blur-[1px] pointer-events-auto">
      <Spinner size={22} className="text-chili-500" />
      {label && <span className="text-xs text-ink-faint">{label}</span>}
    </div>
  );
}

/** Full-page/full-section loader for an initial fetch, replacing the various bare
 *  "Loading…" text placeholders with something more legible and consistent. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-ink-faint">
      <Spinner size={26} className="text-chili-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
