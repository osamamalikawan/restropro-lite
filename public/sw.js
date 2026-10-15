// Restro Pro service worker.
// Strategy: app shell cache-first (fast, works offline); everything else network-first
// with a cache fallback. The REAL offline speed comes from IndexedDB (lib/offline-db.ts) —
// this service worker is what lets the app shell itself load with no network at all.
//
// IMPORTANT: /api/* (and Next's own /_next/data, RSC fetches) must NEVER be cached here.
// Those are per-tenant, per-session, and often per-second-fresh (e.g. /api/employees) — a
// cached response for them can silently show stale or wrong data (including an empty list
// after a real fix shipped) with nothing telling you it's cached. Only the static shell is
// safe to cache-and-fall-back-on.
const CACHE_NAME = "restropro-shell-v2";
const SHELL_URLS = ["/dashboard", "/login", "/manifest.json"];
const NEVER_CACHE_PREFIXES = ["/api/", "/_next/data/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutating requests (POST/PUT/DELETE)

  const url = new URL(request.url);
  if (NEVER_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    // Plain passthrough — no caching, no offline fallback. A failed API call should surface
    // as a real error in the UI, not silently resolve to whatever was cached last.
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/dashboard")))
  );
});
