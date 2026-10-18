"use client";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/lib/posData";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { X, Pencil, Image as ImageIcon } from "lucide-react";
import { Modal, Field, inputCls, btnPrimary, btnGhost } from "@/components/ui/modal";
import { Panel, PanelHead, addBtnCls } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { GalleryPickerModal } from "@/components/gallery-picker-modal";
import { fmtMoney } from "@/lib/format";
import { CATEGORY_SWATCHES } from "@/lib/urdu";

type Category = { id: string; name: string; name_ur?: string | null; sort_order: number; is_active: boolean; color?: string | null };
type Product = {
  id: string;
  name: string;
  name_ur?: string | null;
  price: number;
  category_id: string | null;
  image_url: string | null;
  is_available: boolean;
  menu_categories?: { name: string } | null;
};

export function MenuClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Add / edit category popup
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cNameUr, setCNameUr] = useState("");
  const [cColor, setCColor] = useState<string | null>(null); // null = theme colour
  const [catSaving, setCatSaving] = useState(false);
  const [catModalError, setCatModalError] = useState("");
  const [catError, setCatError] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all"); // "all" | category id | "none"

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fNameUr, setFNameUr] = useState("");
  const [fCategoryId, setFCategoryId] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fImageUrl, setFImageUrl] = useState("");
  const [fAvailable, setFAvailable] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  async function loadAll() {
    const [catRes, prodRes] = await Promise.all([fetch("/api/menu-categories"), fetch("/api/products")]);
    const catData = await catRes.json();
    const prodData = await prodRes.json();
    if (catRes.ok) setCategories(catData.categories ?? []);
    if (prodRes.ok) setProducts(prodData.products ?? []);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  function openAddCategory() {
    setEditingCatId(null);
    setCName("");
    setCNameUr("");
    setCColor(null);
    setCatModalError("");
    setCatModalOpen(true);
  }
  function openEditCategory(c: Category) {
    setEditingCatId(c.id);
    setCName(c.name);
    setCNameUr(c.name_ur ?? "");
    setCColor(c.color ?? null);
    setCatModalError("");
    setCatModalOpen(true);
  }
  /** Save from the popup: a new category (added at the end) or the edited one. */
  async function saveCategory() {
    if (!cName.trim()) {
      setCatModalError("Enter the category name");
      return;
    }
    setCatSaving(true);
    setCatModalError("");
    const existing = editingCatId ? categories.find((c) => c.id === editingCatId) : null;
    const row = existing
      ? { id: existing.id, name: cName.trim(), name_ur: cNameUr.trim() || null, color: cColor, sort_order: existing.sort_order, is_active: existing.is_active }
      : { name: cName.trim(), name_ur: cNameUr.trim() || null, color: cColor, sort_order: categories.length };
    const res = await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: existing ? "update" : "insert", row }),
    });
    setCatSaving(false);
    if (!res.ok) {
      setCatModalError((await res.json().catch(() => ({}))).error ?? "Could not save the category");
      return;
    }
    setCatModalOpen(false);
    setCatError("");
    await loadAll();
    if (isTauri()) invoke("sync_now", { retryRejected: false }).catch(() => {}); // desktop POS picks it up now
  }
  /** Drag / arrows in "Menu categories": save the new order. POS shows its category tabs in this order. */
  async function reorderCategories(next: Category[]) {
    const previous = categories;
    setCategories(next.map((c, i) => ({ ...c, sort_order: i })));
    setCatError("");
    const res = await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "reorder", ids: next.map((c) => c.id) }),
    });
    if (!res.ok) {
      setCategories(previous);
      setCatError((await res.json().catch(() => ({}))).error ?? "Could not save the new order");
      return;
    }
    if (isTauri()) invoke("sync_now", { retryRejected: false }).catch(() => {}); // desktop POS picks it up now
  }

  async function removeCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    const count = products.filter((p) => p.category_id === id).length;
    if (count > 0) {
      setCatError(
        `"${cat?.name ?? "This category"}" still has ${count} item${count === 1 ? "" : "s"}. Move them to another category (or remove them) first, then delete it.`
      );
      return;
    }
    setCatError("");
    const res = await fetch("/api/menu-categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "delete", row: { id } }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error as string | undefined;
      setCatError(
        msg && /foreign key|violates|referenc/i.test(msg)
          ? `"${cat?.name ?? "This category"}" is still used by a deal or product, so it can't be deleted yet.`
          : msg || "Could not remove the category"
      );
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (filterCat === id) setFilterCat("all");
    if (isTauri()) invoke("sync_now", { retryRejected: false }).catch(() => {});
    loadAll();
  }

  function openAdd() {
    setEditingId(null);
    setFName("");
    setFNameUr("");
    setFCategoryId(categories[0]?.id ?? "");
    setFPrice("0");
    setFImageUrl("");
    setFAvailable(true);
    setError("");
    setModalOpen(true);
  }
  function openEdit(p: Product) {
    setEditingId(p.id);
    setFName(p.name);
    setFNameUr(p.name_ur ?? "");
    setFCategoryId(p.category_id ?? "");
    setFPrice(String(p.price));
    setFImageUrl(p.image_url ?? "");
    setFAvailable(p.is_available);
    setError("");
    setModalOpen(true);
  }

  async function saveProduct() {
    if (!fName.trim()) {
      setError("Item name is required");
      return;
    }
    if (categories.length === 0) {
      setError("Add a menu category first");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: editingId ? "update" : "insert",
        row: {
          id: editingId ?? undefined,
          name: fName.trim(),
          name_ur: fNameUr.trim() || null,
          category_id: fCategoryId || null,
          price: Number(fPrice) || 0,
          image_url: fImageUrl.trim() || null,
          is_available: fAvailable,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error);
      return;
    }
    setModalOpen(false);
    loadAll();
  }

  const shownProducts = products.filter((p) =>
    filterCat === "all" ? true : filterCat === "none" ? !p.category_id : p.category_id === filterCat
  );

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <Panel loading={loading} loadingLabel="Loading menu…">
          <PanelHead title="Menu categories" subtitle="Drag to set the order shown in POS. Tap ✎ to edit the name, Urdu name and colour.">
            <button onClick={openAddCategory} className={addBtnCls}>
              + Add category
            </button>
          </PanelHead>
          <div className="px-5 py-4 space-y-1">
            {catError && <p className="mb-2 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{catError}</p>}
            <ReorderableList
              items={categories}
              onChange={reorderCategories}
              renderRow={(c) => {
                const inUse = products.filter((p) => p.category_id === c.id).length;
                return (
                  <>
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-line" style={{ backgroundColor: c.color || "transparent" }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-ink-strong">{c.name}</span>
                          {c.name_ur && (
                            <span dir="rtl" lang="ur" className="shrink-0 text-base leading-snug text-ink-mid">
                              {c.name_ur}
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-ink-faint">
                          {inUse} item{inUse === 1 ? "" : "s"}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5" draggable={false} onMouseDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        draggable={false}
                        onClick={() => openEditCategory(c)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-ink-strong"
                        title="Edit category"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        draggable={false}
                        onClick={() => removeCategory(c.id)}
                        className="grid h-7 w-7 place-items-center rounded-md text-ink-faint hover:bg-hover hover:text-crimson-400"
                        title="Remove category"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </>
                );
              }}
            />
            {categories.length === 0 && <p className="text-xs text-ink-faint py-2">No categories yet — tap “+ Add category”.</p>}
          </div>
        </Panel>

        <Panel loading={loading} loadingLabel="Loading menu…">
          <PanelHead title="Menu products" subtitle="Image-first cards shown to cashiers in POS">
            <button onClick={openAdd} className={addBtnCls}>
              + Add product
            </button>
          </PanelHead>
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {[
              { id: "all", name: "All", count: products.length, color: null as string | null | undefined },
              ...categories.map((c) => ({ id: c.id, name: c.name, count: products.filter((p) => p.category_id === c.id).length, color: c.color })),
              ...(products.some((p) => !p.category_id) ? [{ id: "none", name: "No category", count: products.filter((p) => !p.category_id).length }] : []),
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilterCat(c.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterCat === c.id ? "border-chili-500 bg-chili-500 text-white" : "border-line bg-raised text-ink-mid hover:border-chili-500/60 hover:text-ink-strong"
                }`}
              >
                {c.color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: c.color }} />}
                {c.name} <span className="opacity-70">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="p-5 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
            {shownProducts.map((p) => (
              <div
                key={p.id}
                className={`group relative overflow-hidden rounded-lg border border-line transition hover:-translate-y-0.5 hover:border-chili-500 ${
                  !p.is_available ? "opacity-40" : ""
                }`}
              >
                <div className="h-24 w-full bg-raised bg-cover bg-center" style={p.image_url ? { backgroundImage: `url('${p.image_url}')` } : undefined} />
                <div className="p-3">
                  <div className="mb-1.5 text-[13px] font-bold leading-tight">{p.name}</div>
                  {p.name_ur && (
                    <div dir="rtl" className="mb-1.5 text-base leading-relaxed text-ink-mid">
                      {p.name_ur}
                    </div>
                  )}
                  <div className="font-mono text-[13px] font-bold text-basil-400">{fmtMoney(p.price)}</div>
                </div>
                <button
                  onClick={() => openEdit(p)}
                  title="Edit"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-surface/90 border border-line opacity-0 transition group-hover:opacity-100 hover:bg-raised"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {shownProducts.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-ink-faint">
                {products.length === 0 ? "No products yet — add one above." : "No products in this category."}
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        busy={catSaving}
        title={editingCatId ? "Edit category" : "Add category"}
        width="max-w-sm"
        footer={
          <>
            <button onClick={() => setCatModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveCategory} disabled={catSaving} className={btnPrimary}>
              {catSaving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {catModalError && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{catModalError}</p>}
        <Field label="Category name (English)">
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCategory()}
            className={inputCls}
            placeholder="e.g. Combos"
            autoFocus
          />
        </Field>
        <Field label="Category name (Urdu)">
          <input
            value={cNameUr}
            onChange={(e) => setCNameUr(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCategory()}
            dir="rtl"
            lang="ur"
            className={`${inputCls} text-lg leading-relaxed`}
            placeholder="مثلاً کومبوز"
          />
          <p className="mt-1 text-[11px] text-ink-faint">Shown on the POS category tabs when “Show item & category names in Urdu” is on in Settings.</p>
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-mid">Colour in POS</span>
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_SWATCHES.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setCColor(col)}
                aria-label={`Use ${col}`}
                className={`h-7 w-7 rounded-full border-2 transition ${cColor?.toLowerCase() === col.toLowerCase() ? "border-ink-strong scale-110" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: col }}
              />
            ))}
            <label title="Pick any colour" className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-line bg-raised text-xs text-ink-mid">
              🎨
              <input
                type="color"
                value={cColor || CATEGORY_SWATCHES[0]}
                onChange={(e) => setCColor(e.target.value)}
                className="absolute -inset-2 h-10 w-10 cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
            <span className="h-3 w-3 rounded-full border border-line" style={{ backgroundColor: cColor || "transparent" }} />
            {cColor ? (
              <>
                <span className="font-mono">{cColor}</span>
                <button type="button" onClick={() => setCColor(null)} className="text-chili-500 hover:underline">
                  Use theme colour
                </button>
              </>
            ) : (
              <span>Theme colour (no tint)</span>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={modalOpen}
        // Esc / backdrop click closes only the popup on top: while the recipe popup is open, this one stays.
        onClose={() => {
          setModalOpen(false);
        }}
        busy={saving}
        title={editingId ? "Edit menu item" : "Add menu item"}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className={btnGhost}>
              Cancel
            </button>
            <button onClick={saveProduct} disabled={saving} className={btnPrimary}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
        <Field label="Item name (English)">
          <input value={fName} onChange={(e) => setFName(e.target.value)} className={inputCls} placeholder="e.g. Spicy Chicken Wrap" />
        </Field>
        <Field label="Item name (Urdu)">
          <input
            value={fNameUr}
            onChange={(e) => setFNameUr(e.target.value)}
            dir="rtl"
            lang="ur"
            className={`${inputCls} text-lg leading-relaxed`}
            placeholder="مثلاً چکن شوارما"
          />
          <p className="mt-1 text-[11px] text-ink-faint">Shown in POS, kitchen and invoice when “Show item names in Urdu” is on in Settings.</p>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={fCategoryId} onChange={(e) => setFCategoryId(e.target.value)} className={inputCls}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (Rs)">
            <input value={fPrice} onChange={(e) => setFPrice(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-ink-mid">Photo</span>
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-raised">
              {fImageUrl ? (
                <img src={fImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-faint">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <button type="button" onClick={() => setGalleryOpen(true)} className={btnGhost}>
              🖼 Choose from Master Gallery
            </button>
          </div>
          <p className="mb-1.5 text-[11px] text-ink-faint">Or paste an image URL below — uploading/choosing a photo takes priority.</p>
          <input value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} className={inputCls} placeholder="https://…" />
        </div>

        <label className="flex items-center justify-between pt-1">
          <span className="text-sm font-medium text-ink-strong">Available in POS</span>
          <Switch checked={fAvailable} onChange={setFAvailable} />
        </label>
      </Modal>

      {galleryOpen && (
        <GalleryPickerModal
          onClose={() => setGalleryOpen(false)}
          onPick={(url) => {
            setFImageUrl(url);
            setGalleryOpen(false);
          }}
        />
      )}
    </main>
  );
}
