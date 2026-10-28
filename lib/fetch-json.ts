/** Fetch + parse JSON, but NEVER throw. Used any time several endpoints are fetched together
 *  with Promise.all() — a plain `res.json()` throws on an empty/malformed body (a flaky
 *  request, a dev-server hiccup, a slow route timing out), and inside Promise.all that
 *  exception kills the *entire* batch: even successful sibling requests never reach their
 *  `setState` call. Callers use this per-request instead, so a failure in one endpoint only
 *  affects that endpoint's own data — everything else on the page still renders. */
export async function fetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; error: string }> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e?.message ?? "Network error" };
  }
  let data: T | null = null;
  let parseError = "";
  try {
    data = await res.json();
  } catch {
    parseError = "Empty or invalid response";
  }
  if (!res.ok) {
    const msg = (data as any)?.error ?? parseError ?? `HTTP ${res.status}`;
    return { ok: false, status: res.status, data, error: msg };
  }
  if (parseError) {
    return { ok: false, status: res.status, data: null, error: parseError };
  }
  return { ok: true, status: res.status, data, error: "" };
}
