"use client";
import { useRef, useState } from "react";

/** A list whose rows can be rearranged: drag a row by its handle, or use the up/down arrows
 *  (always available — dragging is awkward on touch screens). Calls onChange with the new order. */
export function ReorderableList<T extends { id: string }>({
  items,
  onChange,
  renderRow,
  disabled,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  renderRow: (item: T) => React.ReactNode;
  disabled?: boolean;
}) {
  const dragId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = items.slice();
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable={!disabled}
          onDragStart={(e) => {
            dragId.current = item.id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", item.id);
          }}
          onDragOver={(e) => {
            if (dragId.current && dragId.current !== item.id) {
              e.preventDefault();
              setOverId(item.id);
            }
          }}
          onDragLeave={() => setOverId((cur) => (cur === item.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            const from = items.findIndex((x) => x.id === dragId.current);
            if (from >= 0) move(from, i);
            dragId.current = null;
            setOverId(null);
          }}
          onDragEnd={() => {
            dragId.current = null;
            setOverId(null);
          }}
          className={`flex items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm ${overId === item.id ? "ring-1 ring-chili-500" : ""}`}
        >
          {!disabled && (
            <span title="Drag to reorder" className="cursor-grab select-none text-ink-faint active:cursor-grabbing">
              ⋮⋮
            </span>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">{renderRow(item)}</div>
          {!disabled && (
            <div className="flex shrink-0 gap-0.5">
              <button
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Move up"
                className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-hover hover:text-ink-strong disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => move(i, i + 1)}
                disabled={i === items.length - 1}
                aria-label="Move down"
                className="grid h-6 w-6 place-items-center rounded text-ink-faint hover:bg-hover hover:text-ink-strong disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
