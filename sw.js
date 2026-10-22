/* Service worker de l'app (GitHub Pages ; inutilisé par l'extension). Même fichier pour toutes
   les façons d'ouvrir l'app : app installée sur ordinateur ou téléphone, raccourci d'écran
   d'accueil, simple onglet du navigateur.
   À la racine pour que sa portée couvre app/, core/ et designs/.
   - Toujours le réseau d'abord : en ligne, chaque page et chaque fichier viennent de la dernière
     version publiée, sans rien à « mettre à jour » à la main. Le cache ne sert que de repli hors
     ligne (ou si le réseau ne répond pas en NETWORK_TIMEOUT_MS).
   - Requêtes « no-store » (vérification de version, core/env.js) : jamais servies par le cache.
   - Android « Partager → EDT UCA » : le fichier .ucasync reçu est déposé en cache pour app/import.html. */
const CACHE = "uca-app-v3";
const NETWORK_TIMEOUT_MS = 4000;
const SHELL = [
  "index.html", "install.html", "aide.html", "404.html", "site.css", "app/index.html", "app/import.html", "app/install.html", "app/import.js", "app/app.css", "app.webmanifest", "manifest.json",
  "app/icons/icon-192.png", "app/icons/icon-512.png",
  "core/env.js", "core/settings.js", "core/shared.js", "core/grades.js", "core/tools.js", "core/transfer.js", "core/agenda.js",
  "choose.html", "choose.js", "settings.html", "settings.js", "designs/designs.json", "vendor/jsQR.js", "vendor/qrcode.js",
];

self.addEventListener("install", (e) => {
  // Réseau d'abord partout : basculer tout de suite sur le nouveau service worker est sans risque.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new Request(new URL(p, self.registration.scope), { cache: "reload" })))).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "uca-share").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

function cacheKey(request) { const u = new URL(request.url); u.search = ""; return u.href; }

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method === "POST" && url.pathname.endsWith("/app/import.html")) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get("file");
      if (file) await (await caches.open("uca-share")).put("shared-file", new Response(await file.text()));
      return Response.redirect(new URL("app/import.html?shared=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== "GET" || e.request.cache === "no-store") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // "Réseau d'abord" doit vraiment interroger le réseau : fetch(e.request) réutilise le mode de
    // cache HTTP par défaut du navigateur, qui peut rendre une réponse sans round-trip (GitHub
    // Pages envoie des en-têtes Cache-Control avec max-age) — une page rechargée après "Mettre à
    // jour" pouvait alors réafficher une version déjà périmée avant même d'atteindre ce service
    // worker. "no-store" force une vraie requête à chaque fois ; seul le cache applicatif (Cache
    // API, ci-dessous) sert de mémoire, en ligne comme hors ligne.
    const network = fetch(new Request(e.request, { cache: "no-store" })).then((res) => {
      if (res.ok && res.type === "basic") cache.put(cacheKey(e.request), res.clone());
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) { /* hors ligne : repli sur le cache ci-dessous */ }
    const cached = await cache.match(cacheKey(e.request), { ignoreSearch: true });
    if (cached) return cached;
    try { return await network; } catch (err) {
      if (e.request.mode === "navigate") {
        const offline = await cache.match(new URL("404.html", self.registration.scope).href);
        if (offline) return offline;
      }
      throw err;
    }
  })());
});
