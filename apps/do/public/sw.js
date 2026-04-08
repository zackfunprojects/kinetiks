/**
 * DeskOf service worker — minimal Phase 2.5 build.
 *
 * Single responsibility: never lose a user's reply draft to a reload
 * or accidental tab close. Drafts are stored in IndexedDB by the
 * editor (see lib/drafts/local-store.ts) — this SW just guarantees
 * the page can boot offline so the editor can read them back.
 *
 * Phase 8 will expand this SW to:
 *   - Cache opportunity cards for offline read (Quality Addendum #3)
 *   - Push notifications for Approvals mode (Standard+)
 *   - Background sync for queued posts when connection returns
 *
 * Cache strategy here is intentionally conservative: network-first
 * for pages so the user always gets fresh data when online, with a
 * tiny fallback shell when offline.
 */

const CACHE_PREFIX = "deskof-";
const CACHE_VERSION = `${CACHE_PREFIX}v1`;
const FALLBACK_URL = "/offline.html";
const PRECACHE = [FALLBACK_URL, "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        // Only evict DeskOf-owned caches. Without the prefix filter we'd
        // wipe runtime caches owned by other apps on the same origin
        // (or future runtime caches we add ourselves) on every upgrade.
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigation requests with offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        const fallback = await cache.match(FALLBACK_URL);
        return fallback ?? Response.error();
      })
    );
    return;
  }

  // Cache-first for the manifest + offline shell only. Everything else
  // goes straight to the network so analytics, draft saves, etc. are
  // never silently served stale.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches
        .match(req)
        .then((cached) => cached ?? fetch(req))
    );
  }
});
