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
  if (msg.type === "UCA_SYNC_REQUEST") { location.href = ROOT + "app/import.html"; return undefined; }
  return undefined; // déconnexion, mise à jour, alarmes : sans objet dans l'app
}

window.chrome = {
  storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
  runtime: {
    id: null,
    getURL: (p) => ROOT + String(p).replace(/^\//, ""),
    sendMessage(msg, cb) { const p = handle(msg); if (typeof cb === "function") p.then(cb); return p; },
    onMessage: { addListener() {} },
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
  const bg = (d && d.preview && d.preview.background) || "#0b57d0";
  tag("meta", { name: "theme-color", content: bg });
  const dark = parseInt(bg.slice(1, 3), 16) + parseInt(bg.slice(3, 5), 16) + parseInt(bg.slice(5, 7), 16) < 384;
  tag("meta", { name: "apple-mobile-web-app-status-bar-style", content: dark ? "black-translucent" : "default" });
})).catch(() => {});
document.documentElement.classList.add("uca-app");

if ("serviceWorker" in navigator) navigator.serviceWorker.register(ROOT + "sw.js", { scope: ROOT }).catch(() => {});
})();
