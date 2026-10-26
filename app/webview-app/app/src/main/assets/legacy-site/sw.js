const CACHE_VERSION = "edt-v6";
const PRECACHE_URLS = ["/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

function precache(cache) {
  return Promise.all(
    PRECACHE_URLS.map((u) =>
      fetch(u, { cache: "reload" })
        .then((resp) => (resp.ok ? cache.put(u, resp) : null))
        .catch(() => null)
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then(precache));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/functions/")) return;

  // Pages: always revalidate against the network so new versions arrive.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req, { cache: "reload" })
        .then((resp) => {
          if (!url.search) {
            const clone = resp.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/index.html")))
    );
    return;
  }

  // Static assets: cache first, then network.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return resp;
      });
    })
  );
});
