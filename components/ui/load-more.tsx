"use client";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/loading";

/** Value that follows `value` after it has stopped changing for `ms` (search boxes: one request
 *  when the cashier pauses typing, not one per keystroke). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The bottom of a paged list: loads the next page automatically when it scrolls into view, and
 *  also shows a "Load more" button (for keyboards, and as a fallback). Render it right after the
 *  rows; it renders nothing when there is no further page. */
export function LoadMore({
  hasMore,
  loading,
  onMore,
  label = "Load more",
}: {
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-4">
      <button
        onClick={onMore}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-raised px-4 py-2 text-sm font-medium text-ink-mid hover:text-ink-strong disabled:opacity-60"
      >
        {loading && <Spinner size={13} />}
        {loading ? "Loading…" : label}
      </button>
    </div>
  );
}

/** For lists that are already fully in memory (small tables): render the first `step` rows and
 *  reveal more as the bottom is reached, so a page with hundreds of rows paints immediately. */
export function useProgressive<T>(rows: T[], step = 50) {
  const [count, setCount] = useState(step);
  // Start over when the list itself changes (new search, filter, reload).
  const first = rows[0];
  useEffect(() => setCount(step), [rows.length, first, step]);
  return {
    visible: rows.slice(0, count),
    hasMore: rows.length > count,
    showMore: () => setCount((c) => c + step),
  };
}
