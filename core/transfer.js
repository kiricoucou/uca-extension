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
  "uca_notes_seen", "uca_notes_history", "uca_subject_colors", "uca_edt_changes", "uca_settings", "uca_filters", "uca_design"];
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

/* Lien partageable chiffré : #e=1.<expiration>.<sel>.<iv>.<données>
   - le fragment après # n'est jamais envoyé dans une requête HTTP : ni GitHub Pages ni aucun
     serveur ne le reçoit ni ne le stocke ;
   - les données sont chiffrées (AES-GCM 256, clé dérivée du code de partage par PBKDF2) : sans
     le code, le lien est illisible, même pour qui le trouve dans un SMS ou un historique ;
   - l'expiration (durée choisie dans Paramètres) est liée au chiffrement (donnée authentifiée) :
     la modifier rend le lien invalide, et l'app refuse tout lien expiré. */
const LINK_PREFIX = "#e=";
const SHARE_HOURS_DEFAULT = 48;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I/L : se recopie sans erreur
const PBKDF2_ITER = 150000;

function b64url(bytes) { return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromB64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return fromB64(s); }
function normCode(code) { return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function randomCode(n = 6) {
  const r = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(r, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
async function deriveKey(code, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* Code et durée du lien, réglés dans Paramètres (côté ordinateur). Code créé au premier lien. */
async function shareDetails() {
  const d = await chrome.storage.local.get(["uca_share_code", "uca_settings"]);
  let code = normCode(d.uca_share_code);
  if (code.length < 4) { code = randomCode(); await chrome.storage.local.set({ uca_share_code: code }); }
  const hours = Number((d.uca_settings || {}).shareLinkHours) || SHARE_HOURS_DEFAULT;
  return { code, hours };
}

function hoursLabel(h) { return h < 24 ? `${h} h` : h % 24 === 0 ? `${h / 24} jour${h / 24 > 1 ? "s" : ""}` : `${h} h`; }

async function buildShareLink(snap, opts) {
  const { code, hours } = opts || await shareDetails();
  const exp = Math.floor(Date.now() / 1000) + Math.round(hours * 3600);
  const header = `1.${exp.toString(36)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = await pipe(new TextEncoder().encode(JSON.stringify(snap)), new CompressionStream("deflate"));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(header) }, await deriveKey(code, salt), plain));
  return `${APP_URL}${LINK_PREFIX}${header}.${b64url(salt)}.${b64url(iv)}.${b64url(ct)}`;
}

/* Lien + ce qu'il faut dire à l'utilisateur (code à taper, durée). */
async function makeShareLink(snap) {
  const details = await shareDetails();
  const link = await buildShareLink(snap || await snapshot(), details);
  return { link, code: details.code, hours: details.hours, message: `Code : ${details.code} (à taper une fois sur le téléphone) · expire dans ${hoursLabel(details.hours)}` };
}

function linkError(message, kind) { const e = new Error(message); e.kind = kind; return e; }

/* Lit l'en-tête sans le code : expiration visible avant même de demander le code. */
function parseLinkHash(h) {
  if (!h) return null;
  if (h.startsWith("#d=")) throw linkError("Ancien format de lien (non chiffré), plus accepté. Génère un nouveau lien depuis l'extension.", "format");
  if (!h.startsWith(LINK_PREFIX)) return null;
  const parts = decodeURIComponent(h.slice(LINK_PREFIX.length)).split(".");
  if (parts.length !== 5 || parts[0] !== "1") throw linkError("Lien illisible ou incomplet.", "format");
  const exp = parseInt(parts[1], 36) * 1000;
  return { header: `${parts[0]}.${parts[1]}`, expiresAt: exp, salt: fromB64url(parts[2]), iv: fromB64url(parts[3]), ct: fromB64url(parts[4]) };
}

async function fromLinkHash(h, code) {
  const p = parseLinkHash(h);
  if (!p) return null;
  if (!(p.expiresAt > Date.now())) throw linkError("Ce lien a expiré. Génère un nouveau lien depuis l'extension (bouton « Générer le lien »).", "expired");
  if (normCode(code).length < 4) throw linkError("Code de partage requis.", "code");
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: p.iv, additionalData: new TextEncoder().encode(p.header) }, await deriveKey(code, p.salt), p.ct);
  } catch (e) {
    throw linkError("Code incorrect (ou lien modifié).", "code");
  }
  return JSON.parse(new TextDecoder().decode(await pipe(new Uint8Array(plain), new DecompressionStream("deflate"))));
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

root.UCA_TRANSFER = { APP_URL, DOWNLOAD_URL, KEYS, SHARE_HOURS_DEFAULT, snapshot, encodeFrames, buildShareLink, makeShareLink, parseLinkHash, fromLinkHash, shareDetails, randomCode, normCode, hoursLabel, collector, validate, applyImport, exportFile, drawQr };
})(self);
