/** Urdu item names + category colours, shared by the POS, Menu, Products and Settings screens. */

export type NameFields = { name: string; name_ur?: string | null };

/** The name to show and print: the Urdu one when Urdu is switched on in Settings and the item has one,
 *  otherwise the English name (so an item without an Urdu name never shows up blank). */
export function displayName(p: NameFields, urduOn: boolean): string {
  const ur = (p.name_ur ?? "").trim();
  return urduOn && ur ? ur : p.name;
}

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** "#RRGGBB" -> "rgba(r, g, b, a)". Used for the soft category tints in the POS. */
export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Handy starting colours for the category colour picker. */
export const CATEGORY_SWATCHES = [
  "#F59E0B", "#DC2626", "#C2410C", "#EAB308", "#65A30D", "#16A34A", "#0D9488",
  "#0891B2", "#2563EB", "#7C3AED", "#E11D48", "#64748B",
];
