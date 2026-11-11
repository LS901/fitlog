// Minimal offline support: network-first for pages, cache-first for static assets.
const CACHE = "fitlog-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") || /\.(png|jpe?g|webp|svg|ico|woff2?)$/.test(url.pathname);

  if (isStatic) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => offlinePage(req)),
  );
});

// Pages are static shells that read their query string on the client (e.g. /workouts/session?id=3),
// so offline, any cached copy of the same path will do for a full page load. Other requests (e.g. RSC
// payloads) must match exactly; when they fail, Next falls back to a full page load, which lands here.
async function offlinePage(req) {
  const exact = await caches.match(req);
  if (exact || req.mode !== "navigate") return exact;
  return (
    (await caches.match(req, { ignoreSearch: true })) ||
    (await caches.match("/")) ||
    Response.error()
  );
}
