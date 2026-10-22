/* The offline till's service worker (3D, F16). It only makes the app's own
 * pages and files load without the internet; sales and the catalogue live
 * in IndexedDB (lib/offline). The API is never cached: money stays live.
 *
 *  - Pages: network first, the last good copy when offline.
 *  - /_next/static: cache first (hashed, so a new build is a new name).
 *  - Other same-origin GETs (fonts, icons): stale while revalidate. */
const VERSION = "bos-till-v1";
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
        return res;
      } catch {
        // Else the till itself: the full-screen one for an installed till (/register), else /pos.
        const till = new URL(req.url).pathname.startsWith("/register") ? "/register" : "/pos";
        const cached = (await caches.match(req)) ?? (await caches.match(till)) ?? (await caches.match("/pos"));
        return cached ?? new Response("Offline, and this page wasn't opened on this till before.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(STATIC);
    const cached = await cache.match(req);
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached ?? fresh;
  })());
});
