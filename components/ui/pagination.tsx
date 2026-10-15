"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Client-side pagination over an array you already fetched. This is NOT server-side
 * offset/cursor pagination — every page still loads its list in one request (with a
 * generous `limit`, bumped where needed), and this just slices it for display so a long
 * table doesn't dump hundreds of rows on screen at once. That's a real, cheap improvement
 * for the sizes these tables realistically hit; true server pagination is a bigger change
 * (API + query params) worth doing later if any single tenant's data actually outgrows one
 * fetch.
 */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Snap back to a valid page if the underlying list shrinks (a filter, a delete) or
  // reloads shorter than where the user was.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { page, setPage, pageCount, pageItems, total: items.length, pageSize };
}

export function Pagination({
  page,
  pageCount,
  onChange,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  total?: number;
  pageSize?: number;
}) {
  if (pageCount <= 1) return null;

  const window = 2;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || (i >= page - window && i <= page + window)) {
      nums.push(i);
    } else if (nums[nums.length - 1] !== "…") {
      nums.push("…");
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line-soft flex-wrap">
      {total !== undefined && pageSize !== undefined && (
        <span className="text-xs text-ink-faint">
          Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-mid hover:bg-raised disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`min-w-[1.75rem] h-7 px-1.5 rounded-lg text-xs font-medium ${
                n === page ? "bg-chili-500 text-white" : "text-ink-mid hover:bg-raised border border-line"
              }`}
            >
              {n}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pageCount}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-ink-mid hover:bg-raised disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
