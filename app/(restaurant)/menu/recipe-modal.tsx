"use client";
import { useEffect, useState } from "react";

type InventoryItem = { id: string; name: string; unit: string };
type RecipeLine = { inventoryItemId: string; name: string; unit: string; quantity: number };

export function RecipeModal({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [newItemId, setNewItemId] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Esc closes this popup only (the Edit menu item popup underneath stays open).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      const [invRes, recipeRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch(`/api/recipes?productId=${productId}`),
      ]);
      const invData = await invRes.json();
      const recipeData = await recipeRes.json();
      if (invRes.ok) setInventoryItems(invData.inventoryItems ?? []);
      if (recipeRes.ok) {
        setLines(
          (recipeData.recipeItems ?? []).map((r: any) => ({
            inventoryItemId: r.inventory_item_id,
            name: r.inventory_items?.name ?? "—",
            unit: r.inventory_items?.unit ?? "",
            quantity: r.quantity,
          }))
        );
      }
    })();
  }, [productId]);

  function addLine() {
    if (!newItemId || !newQty) return;
    const item = inventoryItems.find((i) => i.id === newItemId);
    if (!item) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.inventoryItemId === newItemId);
      if (existing) return prev.map((l) => (l.inventoryItemId === newItemId ? { ...l, quantity: Number(newQty) } : l));
      return [...prev, { inventoryItemId: newItemId, name: item.name, unit: item.unit, quantity: Number(newQty) }];
    });
    setNewItemId("");
    setNewQty("1");
  }
  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.inventoryItemId !== id));
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId,
        items: lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[120]">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Recipe — {productName}</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink-strong">
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-faint">
          Ingredients consumed per 1 unit sold — deducted automatically from inventory on every sale.
        </p>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {lines.map((l) => (
            <div key={l.inventoryItemId} className="flex items-center justify-between text-sm border-b border-line pb-2">
              <span>
                {l.name} <span className="text-ink-faint">× {l.quantity} {l.unit}</span>
              </span>
              <button onClick={() => removeLine(l.inventoryItemId)} className="text-ink-faint hover:text-crimson-400 text-xs">
                Remove
              </button>
            </div>
          ))}
          {lines.length === 0 && <p className="text-ink-faint text-sm">No ingredients yet.</p>}
        </div>

        <div className="flex gap-2">
          <select
            value={newItemId}
            onChange={(e) => setNewItemId(e.target.value)}
            className="flex-1 rounded-md bg-raised border border-line px-3 py-2 text-sm"
          >
            <option value="">Choose ingredient…</option>
            {inventoryItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          <input
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            type="number"
            step="0.01"
            className="w-20 rounded-md bg-raised border border-line px-3 py-2 text-sm"
          />
          <button onClick={addLine} className="rounded-md bg-raised hover:bg-hover px-3 text-sm font-semibold">
            +
          </button>
        </div>

        {error && <p className="text-crimson-400 text-sm">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg bg-raised hover:bg-hover py-2.5 font-semibold text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white font-semibold py-2.5 text-sm"
          >
            {saving ? "Saving…" : "Save recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}
