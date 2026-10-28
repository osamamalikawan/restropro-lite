"use client";
import {
  localGetAll,
  localPutMany,
  enqueueOutbox,
  readOutbox,
  clearOutboxEntry,
} from "@/lib/offline-db";

/**
 * Reference sync engine, demonstrated on `employees`. Read path: instant local read,
 * then background pull + patch. Write path: optimistic local write, queued outbox,
 * flushed to the server in the background (and retried on reconnect).
 *
 * IMPORTANT: `employees` (and any other staff-authenticated tenant data) is intentionally
 * NOT queryable directly from the browser's Supabase client — its RLS policy only allows
 * Super Admin access (see ARCHITECTURE.md and supabase/migrations/0001_init.sql). Staff PIN
 * sessions are our own HMAC-signed cookie, not a Supabase Auth session, so a direct browser
 * query would silently return zero rows under RLS rather than erroring. Both the pull and
 * push paths below go through Next.js API routes (/api/employees) that verify the signed
 * cookie server-side and use the service-role client — never straight to Supabase.
 *
 * To port another module (inventory, sales, ...): add its name to SYNCABLE_STORES in
 * lib/offline-db.ts, add its own /api/<module> route following app/api/employees/route.ts,
 * and add a matching branch in pullAndCache()/flushOutbox() below.
 */

export async function readFast<T>(store: "employees" | "products", restaurantId: string): Promise<T[]> {
  return localGetAll<T>(store, restaurantId);
}

export async function pullAndCache(store: "employees" | "products", restaurantId: string): Promise<void> {
  try {
    const res = await fetch(`/api/${store}`, { credentials: "include" });
    if (!res.ok) return; // offline, or session no longer valid — local cache stays as-is
    const json = await res.json();
    const rows = json[store];
    if (Array.isArray(rows)) await localPutMany(store, rows);
  } catch {
    // offline — local cache (already rendered) is the fallback, nothing else to do here
  }
}

export async function writeOptimistic(
  store: "employees" | "products",
  op: "insert" | "update" | "delete",
  row: any
): Promise<void> {
  const { localPut } = await import("@/lib/offline-db");
  await localPut(store, { ...row, updated_at: new Date().toISOString() });
  await enqueueOutbox({ store, op, row });
  flushOutbox(); // fire-and-forget; safe to call opportunistically
}

let flushing = false;
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const entries = await readOutbox();
    for (const entry of entries) {
      try {
        const res = await fetch(`/api/${entry.store}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ op: entry.op, row: entry.row }),
        });
        if (!res.ok) break; // stop on first failure (likely offline/expired session) — retry next flush
        await clearOutboxEntry(entry.outboxId);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Call once from a layout/page effect: retries the outbox on reconnect and polls
 *  periodically. (No Supabase Realtime subscription here — Realtime respects the same RLS
 *  as normal queries, so it has the identical "silently empty" problem for staff-only tables
 *  as a direct browser query would. A cross-terminal near-real-time update would need a
 *  small server-sent-events or broadcast-channel proxy; the 30s poll below is the simple,
 *  correct-under-RLS stand-in for now.) */
export function startBackgroundSync(store: "employees" | "products", restaurantId: string) {
  const interval = setInterval(() => {
    flushOutbox();
    pullAndCache(store, restaurantId);
  }, 30_000);
  const onOnline = () => {
    flushOutbox();
    pullAndCache(store, restaurantId);
  };
  window.addEventListener("online", onOnline);

  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
  };
}
