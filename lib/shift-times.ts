/** Shift timings from Permissions -> "Default shift timings" (restaurant_settings.shift_start / shift_end),
 *  e.g. 14:00 -> 02:00 (overnight is fine). All maths is done on a clock shifted by the caller's UTC offset
 *  (`tz`, minutes ahead of UTC; Pakistan = 300), so "14:00" means 2 PM where the restaurant is. */

const DAY = 86_400_000;
const MIN = 60_000;

export const DEFAULT_SHIFT_START = "14:00";
export const DEFAULT_SHIFT_END = "02:00";

/** "14:00" or "14:00:00" -> minutes after midnight (falls back to the given default when it is not a time). */
export function toMinutes(v: unknown, fallback: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof v === "string" ? v : "") ?? /^(\d{1,2}):(\d{2})/.exec(fallback)!;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export type Window = { start: number; end: number }; // epoch ms

/** Every shift occurrence around `nowMs`: yesterday's, today's and tomorrow's (so an overnight shift that began
 *  yesterday is found). A shift lasts from start to end; end <= start means it ends the next day. */
function occurrences(nowMs: number, startMin: number, endMin: number, tz: number): Window[] {
  const shift = tz * MIN;
  const localMidnight = Math.floor((nowMs + shift) / DAY) * DAY - shift; // today 00:00 local, as a real instant
  const len = ((endMin - startMin + 1440) % 1440 || 1440) * MIN; // S == E counts as a full 24 h shift
  return [-1, 0, 1].map((d) => {
    const start = localMidnight + d * DAY + startMin * MIN;
    return { start, end: start + len };
  });
}

/** The shift running at `nowMs`, or - when none is - the one that ended most recently. */
export function currentOrPreviousShift(nowMs: number, startStr: unknown, endStr: unknown, tz: number): { kind: "current" | "previous"; start: number; end: number } {
  const s = toMinutes(startStr, DEFAULT_SHIFT_START);
  const e = toMinutes(endStr, DEFAULT_SHIFT_END);
  const occ = occurrences(nowMs, s, e, tz);
  const current = occ.find((w) => w.start <= nowMs && nowMs < w.end);
  if (current) return { kind: "current", ...current };
  const ended = occ.filter((w) => w.end <= nowMs).sort((a, b) => b.end - a.end)[0];
  // a window that has not started yet means yesterday's ended before it: occ[0] always qualifies
  return { kind: "previous", ...(ended ?? occ[0]) };
}

/** The first moment at/after `fromMs` that a shift ends - when someone clocked in at `fromMs` should be clocked
 *  out automatically. */
export function nextShiftEnd(fromMs: number, startStr: unknown, endStr: unknown, tz: number): number {
  const s = toMinutes(startStr, DEFAULT_SHIFT_START);
  const e = toMinutes(endStr, DEFAULT_SHIFT_END);
  const occ = occurrences(fromMs, s, e, tz);
  // include the day after tomorrow too, in case fromMs falls right after today's end
  const more = occurrences(fromMs + DAY, s, e, tz);
  return [...occ, ...more].map((w) => w.end).filter((x) => x > fromMs).sort((a, b) => a - b)[0];
}
