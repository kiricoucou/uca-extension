/* Transfert des données de l'extension (ordinateur) vers l'app téléphone, sans serveur :
   instantané JSON -> deflate -> base64 -> trames "UCA1|session|i|n|morceau" affichées en QR
   animé ; l'app scanne les trames dans n'importe quel ordre puis reconstruit. Le fichier de
   secours (.ucasync) contient le même instantané en JSON lisible. */
(function (root) {
"use strict";

// Racine publique : route elle-même vers le guide d'installation ou l'import (index.html). Base du
// lien partageable (#d=…) uniquement — jamais affichée seule, voir DOWNLOAD_URL ci-dessous.
const APP_URL = "https://kiricoucou.github.io/uca-extension/";
// Lien affiché/scanné pour « ouvrir ou installer l'app » (modale téléphone, bouton Télécharger) :
// toujours le guide d'installation, peu importe l'état de l'appareil qui scanne.
const DOWNLOAD_URL = "https://kiricoucou.github.io/uca-extension/install.html";
const KEYS = ["uca_events", "uca_last_sync", "uca_notes", "uca_releve_notes", "uca_releve_notes_sync", "uca_absences",
  "uca_notes_seen", "uca_edt_changes", "uca_settings", "uca_filters", "uca_design"];
const CHUNK = 480;
const PREFIX = "UCA1";

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
function toB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

async function snapshot() {
  const data = await chrome.storage.local.get(KEYS);
  return { format: "uca-sync", version: 1, exportedAt: new Date().toISOString(), data };
}

async function pack(snap) {
  return toB64(await pipe(new TextEncoder().encode(JSON.stringify(snap)), new CompressionStream("deflate")));
}

async function encodeFrames(snap) {
  const packed = await pack(snap);
  const sid = hash(packed);
  const n = Math.ceil(packed.length / CHUNK);
  return Array.from({ length: n }, (_, i) => `${PREFIX}|${sid}|${i + 1}|${n}|${packed.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

// Durée de vie d'un lien partageable : au-delà, l'app refuse de l'importer (voir fromLinkHash).
// Pas une limite technique — le lien reste lisible indéfiniment — mais un vieux lien qui traîne
// dans un SMS ou un mail ne doit pas rester utilisable indéfiniment pour autant.
const LINK_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/* Même instantané que le QR, mais en un seul lien (fragment #d=…, jamais envoyé ni gardé par
   GitHub Pages ni aucun serveur : le fragment après # n'est jamais transmis dans une requête HTTP,
   le navigateur le garde pour lui) : à coller dans n'importe quelle appli de messagerie, pas besoin
   de caméra. Valable 2 jours (LINK_MAX_AGE_MS) : refais un transfert passé ce délai. */
async function buildShareLink(snap) {
  return `${APP_URL}#d=${encodeURIComponent(await pack(snap))}`;
}

async function fromLinkHash(h) {
  if (!h || !h.startsWith("#d=")) return null;
  const snap = JSON.parse(new TextDecoder().decode(await pipe(fromB64(decodeURIComponent(h.slice(3))), new DecompressionStream("deflate"))));
  const age = snap && snap.exportedAt ? Date.now() - new Date(snap.exportedAt).getTime() : 0;
  if (age > LINK_MAX_AGE_MS) throw new Error("Ce lien a plus de 2 jours, il a expiré. Refais un transfert depuis l'extension (Exporter → Copier un lien).");
  return snap;
}

/* Accumule les trames lues ; repart de zéro si une autre session apparaît. */
function collector() {
  let sid = null, total = 0, parts = new Map();
  return {
    add(text) {
      const m = /^UCA1\|([0-9a-f]{8})\|(\d+)\|(\d+)\|(.*)$/s.exec(text || "");
      if (!m) return { ok: false };
      const [, s, i, n, chunk] = m;
      if (s !== sid) { sid = s; total = Number(n); parts = new Map(); }
      parts.set(Number(i), chunk);
      return { ok: true, received: parts.size, total, done: parts.size === total };
    },
    missing() { return Array.from({ length: total }, (_, k) => k + 1).filter((k) => !parts.has(k)); },
    async result() {
      const packed = Array.from({ length: total }, (_, k) => parts.get(k + 1)).join("");
      if (hash(packed) !== sid) throw new Error("Transfert incomplet ou corrompu, recommence le scan.");
      return JSON.parse(new TextDecoder().decode(await pipe(fromB64(packed), new DecompressionStream("deflate"))));
    },
  };
}

function validate(snap) {
  if (!snap || snap.format !== "uca-sync" || !snap.data || !Array.isArray(snap.data.uca_events)) throw new Error("Ce n'est pas un fichier de synchro de l'emploi du temps UCA.");
  return snap;
}

/* Écrit l'instantané ; garde le design déjà choisi sur l'appareil s'il y en a un. */
async function applyImport(snap) {
  validate(snap);
  const out = {};
  KEYS.forEach((k) => { if (snap.data[k] !== undefined) out[k] = snap.data[k]; });
  const { uca_design } = await chrome.storage.local.get("uca_design");
  if (uca_design) delete out.uca_design;
  out.uca_app_imported_at = new Date().toISOString();
  out.uca_app_exported_at = snap.exportedAt || null;
  await chrome.storage.local.set(out);
  return { events: snap.data.uca_events.length, exportedAt: snap.exportedAt };
}

function exportFile(snap) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snap)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `emploi-du-temps-uca-${snap.exportedAt.slice(0, 10)}.ucasync`;
  // Clic sans propagation : sinon il passe pour un clic hors du panneau ouvert, qui se fermerait.
  document.body.appendChild(a); a.dispatchEvent(new MouseEvent("click", { bubbles: false })); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Dessine un QR (lib qrcode-generator) sur un canvas, fond blanc et marge de 4 modules. */
function drawQr(canvas, text, sizePx) {
  const qr = root.qrcode(0, "L");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount(), quiet = 4, cell = Math.max(2, Math.floor(sizePx / (count + quiet * 2)));
  const size = cell * (count + quiet * 2);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
}

root.UCA_TRANSFER = { APP_URL, DOWNLOAD_URL, LINK_MAX_AGE_MS, KEYS, snapshot, encodeFrames, buildShareLink, fromLinkHash, collector, validate, applyImport, exportFile, drawQr };
})(self);
