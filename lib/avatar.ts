/** Deterministic avatar styling shared by the staff picker and (later) employee/customer/
 *  supplier profile pages — ported 1:1 from the HTML prototype's scripts/utils.js so the
 *  same name always maps to the same initials + color everywhere in the app. */

export const AVATAR_COLORS = ["#D9481F", "#3F6E52", "#4C7EA8", "#B7383F", "#8A5FB0", "#C99A3E", "#2E8B87"];

export function initials(name: string): string {
  return (name || "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function colorForId(id: string): string {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}
