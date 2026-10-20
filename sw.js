/* Service worker de l'app téléphone (GitHub Pages ; inutilisé par l'extension).
   À la racine pour que sa portée couvre app/, core/ et designs/.
   - hors ligne : cache, puis mise à jour en arrière-plan (stale-while-revalidate) ;
   - Android « Partager → EDT UCA » : le fichier .ucasync reçu est déposé en cache pour app/import.html. */
const CACHE = "uca-app-v1";
const SHELL = [
  "index.html", "app/index.html", "app/import.html", "app/install.html", "app/import.js", "app/app.css", "app.webmanifest", "manifest.json",
  "app/icons/icon-192.png", "app/icons/icon-512.png",
  "core/env.js", "core/settings.js", "core/shared.js", "core/tools.js", "core/transfer.js", "core/agenda.js",
  "choose.html", "choose.js", "settings.html", "settings.js", "designs/designs.json", "vendor/jsQR.js", "vendor/qrcode.js",
];

self.addEventListener("install", (e) => {
  // Pas de self.skipWaiting() ici : une mise à jour installée reste "en attente" tant que l'utilisateur
  // n'a pas cliqué "Mettre à jour" (bandeau core/shared.js) — pas de bascule silencieuse sous une page
  // ouverte. Premier chargement (aucun service worker précédent) : prend la main sans attendre quand même.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new URL(p, self.registration.scope)))));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== "uca-share").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

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
  if (e.request.method !== "GET") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
