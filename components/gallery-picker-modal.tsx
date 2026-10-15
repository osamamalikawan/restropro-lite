"use client";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";

type GalleryImage = { id: string; title: string; url: string; category: string | null; tags: string[] | null };

export function GalleryPickerModal({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    fetch("/api/gallery-images")
      .then((r) => r.json())
      .then((d) => setImages(d.images ?? []))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ["All", ...Array.from(new Set(images.map((i) => i.category).filter(Boolean) as string[]))], [images]);
  const filtered = images.filter((i) => {
    const matchesCat = category === "All" || i.category === category;
    const q = query.toLowerCase();
    const matchesQuery = !q || i.title.toLowerCase().includes(q) || (i.tags ?? []).some((t) => t.toLowerCase().includes(q));
    return matchesCat && matchesQuery;
  });

  return (
    <Modal open onClose={onClose} title="Choose from Master Gallery" width="max-w-2xl">
      <div className="flex gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search images or tags…"
          className="flex-1 rounded-md bg-raised border border-line px-3 py-2 text-sm placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chili-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md bg-raised border border-line px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chili-500"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="py-10 text-center text-sm text-ink-faint">Loading gallery…</p>}
      {!loading && filtered.length === 0 && <p className="py-10 text-center text-sm text-ink-faint">No images found.</p>}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-4 gap-2.5 max-h-[52vh] overflow-y-auto pr-1">
          {filtered.map((img) => (
            <button
              key={img.id}
              onClick={() => onPick(img.url)}
              title={img.title}
              className="group relative aspect-square overflow-hidden rounded-lg border border-line transition hover:border-chili-500"
            >
              <img src={img.url} alt={img.title} className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                {img.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
