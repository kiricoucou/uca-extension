/* Chargé en premier par chaque page. Dans l'extension : ne fait rien.
   Hors extension (app téléphone servie depuis GitHub Pages) : fournit un équivalent minimal
   des API chrome.* utilisées par le core (stockage local, messages, onglets), ajoute les
   balises d'installation (manifeste, icônes, écrans de démarrage iOS) et le service worker. */
(function () {
"use strict";
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) return;

const ROOT = new URL("..", document.currentScript.src).href;
const STORE = "uca_store";
window.UCA_APP = { root: ROOT };

/* ---------- chrome.storage.local sur localStorage (données de quelques centaines de Ko) ---------- */
const listeners = [];
function readAll() { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { return {}; } }
function writeAll(all) { localStorage.setItem(STORE, JSON.stringify(all)); }
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function notify(changes) { if (Object.keys(changes).length) setTimeout(() => listeners.forEach((fn) => fn(changes, "local")), 0); }
function done(result, cb) { const p = Promise.resolve(result); if (cb) p.then(cb); return p; }
const local = {
  get(keys, cb) {
    const all = readAll(), out = {};
    if (keys == null) Object.assign(out, all);
    else if (typeof keys === "string") { if (keys in all) out[keys] = all[keys]; }
    else if (Array.isArray(keys)) keys.forEach((k) => { if (k in all) out[k] = all[k]; });
    else Object.keys(keys).forEach((k) => { out[k] = k in all ? all[k] : keys[k]; });
    return done(clone(out), cb);
  },
  set(obj, cb) {
    const all = readAll(), changes = {};
    Object.keys(obj).forEach((k) => { changes[k] = { oldValue: all[k], newValue: clone(obj[k]) }; all[k] = clone(obj[k]); });
    writeAll(all); notify(changes);
    return done(undefined, cb);
  },
  remove(keys, cb) {
    const all = readAll(), changes = {};
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => { if (k in all) { changes[k] = { oldValue: all[k] }; delete all[k]; } });
    writeAll(all); notify(changes);
    return done(undefined, cb);
  },
};
window.addEventListener("storage", (e) => {
  if (e.key !== STORE) return;
  const before = JSON.parse(e.oldValue || "{}"), after = JSON.parse(e.newValue || "{}"), changes = {};
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((k) => {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { oldValue: before[k], newValue: after[k] };
  });
  notify(changes);
});

/* ---------- Mise à jour de l'app (même bandeau que l'extension, core/shared.js UCA_CORE) ----------
   Vaut pour toutes les façons d'ouvrir l'app (installée sur ordinateur/téléphone, raccourci,
   onglet). sw.js sert tout en réseau d'abord : en ligne, la page est déjà la dernière version.
   « current » = manifest.json tel que cette page l'a obtenu (réseau, ou cache si hors ligne /
   réseau trop lent) ; « latest » = manifest.json du site publié, en "no-store" (jamais servi par
   le cache). Différents = la page tourne sur une copie en cache : « Mettre à jour » vide le cache
   et recharge. Même site pour les deux : pas de faux positif pendant le déploiement de GitHub Pages. */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
  return 0;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
// Version de la page en cours, lue une fois au chargement (même chemin que la page elle-même).
const loadedManifest = fetch(ROOT + "manifest.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
async function fetchLatestManifest() {
  const res = await fetch(ROOT + "manifest.json?latest=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
let lastCheckAt = 0;
async function checkAppUpdate() {
  lastCheckAt = Date.now();
  // Un échec isolé (réseau lent, DNS, service worker encore en train de s'installer...) ne doit
  // pas faire croire que la vérification "ne marche pas" : un deuxième essai avant d'abandonner.
  let lat = null, lastError = null;
  for (let i = 0; i < 2 && !lat; i++) {
    if (i) await sleep(1200);
    try { lat = await fetchLatestManifest(); } catch (e) { lastError = e; }
  }
  if (!lat) { await local.set({ uca_update_check_failed: String(lastError) }); return; }
  try {
    const cur = (await loadedManifest) || lat;
    const current = cur && cur.version, latest = lat && lat.version;
    if (!current || !latest) { await local.set({ uca_update_check_failed: "manifest.json invalide" }); return; }
    await local.set({ uca_current_version: current, uca_latest_version: latest, uca_update_available: compareVersions(current, latest) < 0, uca_update_check_failed: null });
  } catch (e) { await local.set({ uca_update_check_failed: String(e) }); }
}
// Nouvelle version détectée : il ne suffit PAS de recharger la page, le service worker sert le
// shell en cache-first (stale-while-revalidate, sw.js) — un simple reload réaffiche donc l'ancienne
// version tant que le cache n'est pas vidé. sw.js lui-même ne change presque jamais d'une version
// à l'autre (seul le code des designs/core change), donc reg.update()/skipWaiting ne suffit pas non
// plus : rien de neuf à installer de son point de vue. On vide directement le cache de l'app (tout
// sauf "uca-share", le fichier .ucasync reçu par partage Android, pas encore consommé) avant de
// recharger : chaque fichier repart d'une vraie requête réseau.
async function applyAppUpdate() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== "uca-share").map((k) => caches.delete(k)));
    }
    const reg = await navigator.serviceWorker.getRegistration(ROOT);
    if (reg) { await reg.update(); if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" }); }
  } catch (e) { /* on recharge quand même ci-dessous */ }
  location.reload();
}
// App laissée ouverte (téléphone en veille, fenêtre en arrière-plan) : revérifie au retour.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastCheckAt > 30 * 60 * 1000) checkAppUpdate();
});

/* ---------- Pont avec l'extension Chrome, si elle est installée dans ce même navigateur ----------
   content-bridge.js (chargé par l'extension sur ce domaine, voir manifest.json content_scripts)
   relaie par window.postMessage : présence, état de session, résultats de synchro. Permet à l'app
   de déclencher une vraie synchro Odin (au lieu du transfert manuel par lien/QR/fichier) quand
   l'extension est là ; sinon, seul le transfert par lien/QR/fichier reste possible (pas de CORS
   ni d'accès aux cookies d'un autre domaine depuis une simple page web, voir README). */
const msgListeners = [];
window.UCA_APP.extensionReady = false;
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.source !== "uca-extension") return;
  const msg = ev.data;
  if (msg.type === "UCA_EXTENSION_READY" && !window.UCA_APP.extensionReady) {
    window.UCA_APP.extensionReady = true;
    window.dispatchEvent(new Event("uca-extension-ready"));
  }
  // Les résultats de synchro de l'extension vivent dans SON stockage (origine chrome-extension://…,
  // jamais accessible depuis une page web) : on les recopie ici pour que l'app reste utilisable
  // hors ligne et après un rechargement, exactement comme un transfert par lien le ferait.
  if (msg.type === "UCA_SYNC_RESULT" && msg.ok) {
    const out = { uca_events: msg.events, uca_last_sync: msg.lastSync, uca_session_expired: false };
    if (Array.isArray(msg.edtChanges)) out.uca_edt_changes = msg.edtChanges;
    local.set(out);
  } else if (msg.type === "UCA_ABSENCES_RESULT" && msg.ok) {
    local.set({ uca_absences: msg.absences, uca_absences_sync: msg.sync });
  } else if (msg.type === "UCA_NOTES_RESULT" && msg.ok) {
    // Sans les notes « vues » de l'extension, l'app ne saurait pas quelles notes sont nouvelles
    // (pas d'orange) : elles voyagent avec le relevé.
    const out = { uca_releve_notes: msg.releve, uca_releve_notes_sync: msg.sync };
    if (msg.notesSeen) out.uca_notes_seen = msg.notesSeen;
    local.set(out);
  } else if (msg.type === "UCA_SESSION_STATE") {
    local.set({ uca_session_expired: !!msg.expired });
  }
  msgListeners.forEach((fn) => fn(msg));
});

/* ---------- Messages vers le « service worker » de l'extension ---------- */
async function handle(msg) {
  if (!msg) return undefined;
  if (msg.type === "UCA_SET_DESIGN") {
    const designs = await fetch(ROOT + "designs/designs.json").then((r) => r.json());
    const d = designs.find((x) => x.id === msg.id);
    if (!d) return { ok: false, error: "Design inconnu" };
    await local.set({ uca_design: d.id });
    return { ok: true, folder: d.folder };
  }
  if (msg.type === "UCA_SYNC_REQUEST") {
    // Extension détectée : vraie synchro via le pont, pas de redirection vers l'écran d'import.
    if (window.UCA_APP.extensionReady && (msg.mode === "resync" || msg.mode === "login")) {
      window.postMessage({ source: "uca-site", type: "UCA_SYNC_REQUEST", mode: msg.mode }, location.origin);
      return undefined;
    }
    location.href = ROOT + "app/import.html"; return undefined;
  }
  if (msg.type === "UCA_FORCE_UPDATE_CHECK") { checkAppUpdate(); return undefined; }
  if (msg.type === "UCA_APPLY_UPDATE") { applyAppUpdate(); return undefined; }
  return undefined; // déconnexion, alarmes : sans objet dans l'app
}

window.chrome = {
  storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
  runtime: {
    id: null,
    getURL: (p) => ROOT + String(p).replace(/^\//, ""),
    sendMessage(msg, cb) { const p = handle(msg); if (typeof cb === "function") p.then(cb); return p; },
    onMessage: { addListener: (fn) => msgListeners.push(fn) },
  },
  tabs: { create: ({ url }) => { location.href = url; } },
};

/* ---------- Installation : manifeste, icônes, écrans de démarrage, thème ---------- */
const head = document.head;
function tag(name, attrs) { const e = document.createElement(name); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); head.appendChild(e); }
tag("link", { rel: "manifest", href: ROOT + "app.webmanifest" });
tag("link", { rel: "apple-touch-icon", href: ROOT + "app/icons/apple-touch-icon.png" });
tag("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
tag("meta", { name: "mobile-web-app-capable", content: "yes" });
tag("meta", { name: "apple-mobile-web-app-title", content: "EDT UCA" });
const SPLASH = [[1290, 2796, 3], [1179, 2556, 3], [1284, 2778, 3], [1170, 2532, 3], [1125, 2436, 3], [1242, 2688, 3], [828, 1792, 2], [750, 1334, 2]];
SPLASH.forEach(([w, h, r]) => tag("link", {
  rel: "apple-touch-startup-image", href: `${ROOT}app/splash/splash-${w}x${h}.png`,
  media: `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));
const viewport = document.querySelector('meta[name="viewport"]');
if (viewport) viewport.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=cover");
local.get("uca_design").then(({ uca_design }) => fetch(ROOT + "designs/designs.json").then((r) => r.json()).then((designs) => {
  const d = designs.find((x) => x.id === uca_design);
  const p = (d && d.preview) || {};
  const bg = p.background || "#0b57d0";
  tag("meta", { name: "theme-color", content: bg });
  const dark = parseInt(bg.slice(1, 3), 16) + parseInt(bg.slice(3, 5), 16) + parseInt(bg.slice(5, 7), 16) < 384;
  tag("meta", { name: "apple-mobile-web-app-status-bar-style", content: dark ? "black-translucent" : "default" });
  // Pages génériques app/app.css (install, import, accueil) seulement : couleurs du design déjà
  // choisi, pour qu'elles ne retombent pas sur un bleu générique entre deux écrans du design.
  // Jamais sur designs/<id>/agenda.html : ces pages ont déjà leurs propres variables --surface etc.
  // pour toute l'interface (boutons, panneaux...), qu'un style inline (toujours prioritaire)
  // écraserait entièrement — exactement ce qui a rendu tous les boutons jaunes sur carnet.
  if (d && /\/app\/(install|import|index)\.html$/.test(location.pathname)) {
    const root = document.documentElement.style;
    [["--bg", "background"], ["--surface", "surface"], ["--accent", "accent"], ["--on-accent", "onAccent"],
      ["--text", "text"], ["--text-dim", "textDim"], ["--border", "border"]].forEach(([cssVar, key]) => {
      if (p[key]) root.setProperty(cssVar, p[key]);
    });
  }
})).catch(() => {});
document.documentElement.classList.add("uca-app");

if ("serviceWorker" in navigator) navigator.serviceWorker.register(ROOT + "sw.js", { scope: ROOT }).catch(() => {});
})();
