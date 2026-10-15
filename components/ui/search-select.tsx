"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { inputCls } from "@/components/ui/modal";

export type SearchOption = { id: string; label: string; hint?: string };

/** A type-to-search chooser to replace long <select> lists: click, start typing part of a name, pick with the
 *  mouse or the arrow keys + Enter. Shows `hint` (unit / price...) in grey after each name. */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyText = "Nothing matches",
}: {
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return options;
    // names starting with the text first, then names that merely contain it
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(t));
    const rest = options.filter((o) => !o.label.toLowerCase().startsWith(t) && o.label.toLowerCase().includes(t));
    return [...starts, ...rest];
  }, [options, q]);

  useEffect(() => setActive(0), [q, open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(o: SearchOption) {
    onChange(o.id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={root} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={open ? q : selected ? selected.label : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && shown[active]) pick(shown[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
              setQ("");
            }
          }}
          placeholder={selected && !open ? selected.label : placeholder}
          className={`${inputCls} pl-9 ${value ? "pr-9" : ""}`}
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQ("");
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-strong"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <div ref={listRef} className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          {shown.length === 0 && <div className="px-3 py-2.5 text-sm text-ink-faint">{emptyText}</div>}
          {shown.map((o, i) => (
            <button
              type="button"
              key={o.id}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus so the click lands before the input blurs
              onClick={() => pick(o)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === active ? "bg-hover" : ""} ${o.id === value ? "font-semibold text-chili-500" : "text-ink-strong"}`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-ink-faint">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
