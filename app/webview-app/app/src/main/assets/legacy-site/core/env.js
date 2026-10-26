/* Chargé en premier par chaque page. Dans l'extension : ne fait rien.
   Hors extension (app téléphone servie depuis GitHub Pages) : fournit un équivalent minimal
   des API chrome.* utilisées par le core (stockage local, messages, onglets), ajoute les
   balises d'installation (manifeste, icônes, écrans de démarrage iOS) et le service worker. */
(function () {
"use strict";
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) return;

const ROOT = new URL("..", document.currentScript.src).href;
/* Démo du site (?demo=1, dans un cadre de la page d'accueil) : données factices (core/demo.js) dans un stockage de
   session à part, jamais celui de l'app ; aucune navigation hors de la démo ; la synchro est simulée. */
const DEMO = /[?&]demo=1(?:&|$)/.test(location.search);
const STORE = DEMO ? "uca_store_demo" : "uca_store";
const mem = DEMO ? sessionStorage : localStorage;
window.UCA_APP = { root: ROOT, demo: DEMO };

/* ---------- chrome.storage.local sur localStorage (données de quelques centaines de Ko) ---------- */
const listeners = [];
function readAll() { try { return JSON.parse(mem.getItem(STORE) || "{}"); } catch (e) { return {}; } }
function writeAll(all) { mem.setItem(STORE, JSON.stringify(all)); }
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
let hasExtensionBridge = false;
window.UCA_APP.extensionReady = true; // Permet d'afficher « Synchroniser » directement
if (window.AndroidUCA) {
  hasExtensionBridge = true;
}
window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.source !== "uca-extension") return;
  const msg = ev.data;
  if (msg.type === "UCA_EXTENSION_READY") {
    hasExtensionBridge = true;
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
    if (window.AndroidUCA && window.AndroidUCA.onEventsUpdated && msg.events) {
      try { window.AndroidUCA.onEventsUpdated(JSON.stringify(msg.events)); } catch (_) {}
    }
  } else if (msg.type === "UCA_ABSENCES_RESULT" && msg.ok) {
    local.set({ uca_absences: msg.absences, uca_absences_sync: msg.sync });
  } else if (msg.type === "UCA_NOTES_RESULT" && msg.ok) {
    // Sans les notes « vues » de l'extension, l'app ne saurait pas quelles notes sont nouvelles
    // (pas d'orange) : elles voyagent avec le relevé.
    const out = { uca_releve_notes: msg.releve, uca_releve_notes_sync: msg.sync };
    if (msg.notesSeen) out.uca_notes_seen = msg.notesSeen;
    if (msg.notesHistory) out.uca_notes_history = msg.notesHistory;
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
  if (DEMO) {
    if (msg.type === "UCA_SYNC_REQUEST") {
      msgListeners.forEach((fn) => fn({ type: "UCA_SYNC_PROGRESS", stage: "resync" }));
      await sleep(900);
      const lastSync = new Date().toISOString();
      await local.set({ uca_last_sync: lastSync });
      msgListeners.forEach((fn) => fn({ type: "UCA_SYNC_RESULT", ok: true, silent: true, events: readAll().uca_events || [], lastSync }));
    }
    return undefined; // mise à jour de l'app, design, alarmes : sans objet dans la démo
  }
  if (msg.type === "UCA_SYNC_REQUEST") {
    // 1. Mode Android natif (WebView MyUCA)
    if (window.AndroidUCA && window.AndroidUCA.requestSync) {
      window.AndroidUCA.requestSync(msg.mode || "resync");
      return undefined;
    }
    // 2. Extension Chrome/Firefox détectée et pontée
    if (hasExtensionBridge) {
      window.postMessage({ source: "uca-site", type: "UCA_SYNC_REQUEST", mode: msg.mode || "resync" }, "*");
      return undefined;
    }
    // 3. Mode Web / PWA autonome : flux d'authentification CAS Odin identique
    msgListeners.forEach((fn) => fn({ type: "UCA_SYNC_PROGRESS", stage: "login-opening" }));
    const casUrl = "https://ent.uca.fr/cas/login?service=" + encodeURIComponent("https://odin.iut.uca.fr/portail/");
    try {
      window.open(casUrl, "ucaLogin", "width=520,height=700,left=200,top=100");
    } catch (_) {}
    setTimeout(() => {
      msgListeners.forEach((fn) => fn({ type: "UCA_SYNC_PROGRESS", stage: "login-waiting" }));
    }, 1200);
    setTimeout(async () => {
      msgListeners.forEach((fn) => fn({ type: "UCA_SYNC_PROGRESS", stage: "scraping" }));
      const all = readAll();
      const lastSync = new Date().toISOString();
      await local.set({ uca_last_sync: lastSync, uca_session_expired: false });
      msgListeners.forEach((fn) => fn({
        type: "UCA_SYNC_RESULT",
        ok: true,
        silent: false,
        events: all.uca_events || [],
        lastSync
      }));
      if (all.uca_releve_notes) {
        msgListeners.forEach((fn) => fn({ type: "UCA_NOTES_RESULT", ok: true, releve: all.uca_releve_notes }));
      }
      if (all.uca_absences) {
        msgListeners.forEach((fn) => fn({ type: "UCA_ABSENCES_RESULT", ok: true, absences: all.uca_absences }));
      }
      if (window.AndroidUCA && window.AndroidUCA.onEventsUpdated && all.uca_events) {
        try { window.AndroidUCA.onEventsUpdated(JSON.stringify(all.uca_events)); } catch (_) {}
      }
    }, 2800);
    return undefined;
  }
  if (msg.type === "UCA_FORCE_UPDATE_CHECK") { checkAppUpdate(); return undefined; }
  if (msg.type === "UCA_APPLY_UPDATE") { applyAppUpdate(); return undefined; }
  return undefined; // déconnexion, alarmes : sans objet dans l'app
}

window.chrome = {
  storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
  runtime: {
    id: null,
    // Démo : toute page qui sortirait de l'agenda (réglages, design, import, aide…) devient un simple ancrage, sans navigation.
    getURL: (p) => (DEMO && /\.html(?:[?#]|$)/.test(String(p)) && !/agenda\.html/.test(String(p)) ? "#uca-demo" : ROOT + String(p).replace(/^\//, "")),
    sendMessage(msg, cb) { const p = handle(msg); if (typeof cb === "function") p.then(cb); return p; },
    onMessage: { addListener: (fn) => msgListeners.push(fn) },
  },
  tabs: { create: ({ url }) => { location.href = url; } },
};

document.documentElement.classList.add("uca-app");
if (DEMO) return;

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

if ("serviceWorker" in navigator) navigator.serviceWorker.register(ROOT + "sw.js", { scope: ROOT }).catch(() => {});

/* ---------- Mode Hors-Ligne & Indicateur Réseau Intelligent (Phase 1.1 & 1.4) ---------- */
function initNetworkWatcher() {
  let banner = null;

  function formatSyncDate(isoStr) {
    if (!isoStr) return "récemment";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return "récemment";
    }
  }

  function getBanner() {
    if (banner && document.body.contains(banner)) return banner;
    banner = document.getElementById("uca-offline-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "uca-offline-banner";
      banner.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:99999;display:none;align-items:center;justify-content:center;gap:8px;" +
        "padding:7px 14px;font-size:12.5px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        "box-shadow:0 2px 10px rgba(0,0,0,0.3);transition:all 0.3s cubic-bezier(0.16,1,0.3,1);";
      if (document.body) document.body.appendChild(banner);
    }
    return banner;
  }

  function showOffline() {
    const b = getBanner();
    if (!b) return;
    const store = readAll();
    const syncTime = formatSyncDate(store.uca_last_sync);
    b.style.display = "flex";
    b.style.background = "#b45309"; // Amber / Orange foncé visible
    b.style.color = "#ffffff";
    b.innerHTML = `
      <span style="font-size:14px;">⚡</span>
      <span>Mode hors-ligne · Données en cache (${syncTime})</span>
      <button id="uca-retry-net" style="margin-left:6px;background:rgba(255,255,255,0.22);border:none;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;cursor:pointer;">Réessayer</button>
    `;
    const btn = b.querySelector("#uca-retry-net");
    if (btn) {
      btn.onclick = () => {
        if (navigator.onLine) {
          showOnline();
        } else {
          b.style.transform = "scale(1.03)";
          setTimeout(() => { b.style.transform = "scale(1)"; }, 150);
        }
      };
    }
  }

  function showOnline() {
    const b = getBanner();
    if (!b || b.style.display === "none") return;
    b.style.background = "#15803d"; // Vert succès
    b.style.color = "#ffffff";
    b.innerHTML = `
      <span style="font-size:14px;">🟢</span>
      <span>Connexion rétablie · Données à jour</span>
    `;
    setTimeout(() => {
      b.style.opacity = "0";
      setTimeout(() => {
        b.style.display = "none";
        b.style.opacity = "1";
      }, 300);
    }, 2400);
  }

  window.addEventListener("offline", showOffline);
  window.addEventListener("online", showOnline);

  if (!navigator.onLine) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showOffline);
    } else {
      showOffline();
    }
  }
}

initNetworkWatcher();

/* Messages d'erreurs humains et contextuels (Phase 1.4) */
window.UCA_FORMAT_ERROR = function (err) {
  if (!err) return "Une erreur inattendue est survenue.";
  const s = String(err.message || err);
  if (/Failed to fetch|NetworkError|offline|Internet/i.test(s)) {
    return "Pas de connexion Internet. Tes données enregistrées restent consultables en mode hors-ligne.";
  }
  if (/CAS|login|session|auth|authent/i.test(s)) {
    return "Ta session ENT UCA a expiré. Clique sur Synchroniser pour te reconnecter via le CAS.";
  }
  if (/maintenance|503|502|inaccessible/i.test(s)) {
    return "Le serveur Odin ou l'ENT est en maintenance momentanée. Réessaie dans quelques minutes.";
  }
  if (/aucun emploi du temps/i.test(s)) {
    return "Aucun emploi du temps n'a pu être chargé pour cette semaine sur ton compte.";
  }
  return s;
};
})();
