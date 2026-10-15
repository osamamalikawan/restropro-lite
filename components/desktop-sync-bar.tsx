"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@/lib/posData";
import { useOnline } from "@/lib/desktop/connectivity";
import { Spinner } from "@/components/ui/loading";
import { ShellUpdateCheck } from "@/components/shell-update-check";
import { WEB_BUILD, WEB_VERSION } from "@/lib/app-version";

type SyncStatus = {
  last_sync_at: string | null;
  hours_since_sync: number | null;
  hours_left: number | null;
  pending_sales: number;
  rejected_sales: number;
  locked: boolean;
  lock_reason: string | null;
  last_error: string | null;
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Desktop sync status, shown in the header (top bar). A compact pill — status dot, short label,
 *  and a count when sales are waiting to upload — that opens a small panel with the details and a
 *  "Sync now" button. Also owns the full-screen "Sync required" block once the 3-day offline limit
 *  is reached (the Rust side enforces the same rule, so hiding this doesn't unlock selling). */
export function DesktopSyncBar() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null); // the installed Tauri shell
  const { online, recheck } = useOnline();
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    invoke<SyncStatus>("get_sync_status").then(setSt).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (isTauri()) getVersion().then(setDesktopVersion).catch(() => setDesktopVersion("unknown"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function syncNow(retryRejected = false) {
    setBusy(true);
    setMsg("");
    try {
      setSt(await invoke<SyncStatus>("sync_now", { retryRejected }));
      recheck();
    } catch (e) {
      setMsg(typeof e === "string" ? e : "Sync failed");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isTauri() || !st) return null;

  const problem = !!(st.last_error || msg) || st.rejected_sales > 0;
  const attention = st.pending_sales > 0 || (st.hours_left ?? 99) <= 24;
  const tone = !online ? "off" : problem ? "bad" : attention ? "warn" : "ok";
  const dot = { off: "bg-ink-faint", bad: "bg-crimson-500", warn: "bg-turmeric-500", ok: "bg-basil-500" }[tone];
  const label = !online ? "Offline" : st.pending_sales > 0 ? `${st.pending_sales} to upload` : st.last_sync_at ? `Synced ${ago(st.last_sync_at)}` : "Not synced";

  return (
    <>
      {st.locked && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
            <h2 className="mb-2 font-display text-lg font-semibold">Sync required</h2>
            <p className="mb-4 text-sm text-ink-faint">{st.lock_reason}</p>
            {st.pending_sales > 0 && <p className="mb-4 text-sm">{st.pending_sales} sale(s) are saved on this device and will upload during the sync.</p>}
            {msg && <p className="mb-3 text-sm text-crimson-400">{msg}</p>}
            <button onClick={() => syncNow()} disabled={busy} className="rounded-lg bg-chili-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
      )}

      <div ref={box} className="relative">
        <button
          onClick={() => {
            setOpen((v) => !v);
            refresh();
          }}
          title="Sync status"
          className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium text-ink-mid transition-colors hover:border-chili-500 hover:text-ink-strong"
        >
          {busy ? <Spinner size={11} /> : <span className={`h-2 w-2 rounded-full ${dot}`} />}
          <span className="hidden whitespace-nowrap lg:inline">{label}</span>
          {st.pending_sales > 0 && (
            <span className="rounded-full bg-turmeric-500/20 px-1.5 py-0.5 text-[10px] font-bold text-turmeric-400 lg:hidden">{st.pending_sales}</span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-line bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-ink-strong">Sync status</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${online ? "bg-basil-500/15 text-basil-400" : "bg-turmeric-500/20 text-turmeric-400"}`}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Last synced</dt>
                <dd className="text-right text-ink-strong">{st.last_sync_at ? `${ago(st.last_sync_at)} · ${new Date(st.last_sync_at).toLocaleString()}` : "Never"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Waiting to upload</dt>
                <dd className="text-ink-strong">{st.pending_sales} sale(s)</dd>
              </div>
              {st.hours_left != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Sync needed within</dt>
                  <dd className={st.hours_left <= 24 ? "text-turmeric-400" : "text-ink-strong"}>{st.hours_left} h</dd>
                </div>
              )}
              {st.rejected_sales > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-crimson-400">{st.rejected_sales} rejected by the server</dt>
                  <dd>
                    <button onClick={() => syncNow(true)} disabled={busy} className="underline text-ink-strong">
                      Retry
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            {(msg || st.last_error) && <p className="mt-3 break-words rounded-lg bg-crimson-500/10 px-2.5 py-2 text-[11px] text-crimson-400">{msg || st.last_error}</p>}
            <button
              onClick={() => syncNow()}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-chili-500 py-2 text-xs font-semibold text-white hover:bg-chili-600 disabled:opacity-60"
            >
              {busy && <Spinner size={12} />}
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <div className="mt-3 border-t border-line pt-3 text-ink-mid">
              <dl className="mb-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Desktop version</dt>
                  <dd className="font-mono text-ink-strong">{desktopVersion ? (desktopVersion === "unknown" ? "unknown" : `v${desktopVersion}`) : "…"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-faint">Web version</dt>
                  <dd className="font-mono text-ink-strong">
                    {WEB_VERSION === "unknown" ? "unknown" : `v${WEB_VERSION}`}
                    {WEB_BUILD && <span className="text-ink-faint"> ({WEB_BUILD})</span>}
                  </dd>
                </div>
              </dl>
              <ShellUpdateCheck />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
