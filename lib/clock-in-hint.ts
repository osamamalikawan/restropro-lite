/** Desktop app only: remembers when this cashier signed in, so the clock-out summary still has the right
 *  start time if the server could not be reached at sign-in (offline). The server keeps the real record. */
const KEY = "rp_clock_in";
const MAX_AGE = 20 * 60 * 60 * 1000;

type Hint = { employeeId: string; at: string };

function read(): Hint | null {
  try {
    const h = JSON.parse(localStorage.getItem(KEY) || "null") as Hint | null;
    if (!h?.at || !h.employeeId || Date.now() - Date.parse(h.at) > MAX_AGE) return null;
    return h;
  } catch {
    return null;
  }
}

/** Call right after a successful PIN check. Keeps the earlier time if the same person is still clocked in. */
export function rememberClockIn(employeeId: string): string {
  const prev = read();
  if (prev && prev.employeeId === employeeId) return prev.at;
  const at = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify({ employeeId, at }));
  } catch {
    /* storage unavailable - the server still has the record */
  }
  return at;
}

export function getClockInHint(): string | null {
  return read()?.at ?? null;
}

export function forgetClockIn() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
