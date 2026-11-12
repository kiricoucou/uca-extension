/* Mise à jour automatique d'une extension chargée en mode développeur (Chrome, Edge, Brave, Chromium).
   Une extension ne peut pas se réécrire elle-même, mais l'utilisateur peut lui donner une fois l'accès en écriture à SON
   dossier (API File System Access, boîte « Sélectionner un dossier » du navigateur). Ensuite : téléchargement du ZIP publié
   (HTTPS, GitHub), décompression ici, écriture des fichiers dans ce dossier (manifest.json en dernier), puis rechargement.
   Le dossier choisi est mémorisé (IndexedDB) ; si le navigateur garde l'autorisation, la mise à jour peut même se faire
   sans clic (service worker). Aucune donnée personnelle ne quitte le navigateur : on télécharge seulement un fichier public.
   Indisponible dans Firefox (pas de showDirectoryPicker) : retour aux instructions manuelles. */
(function (root) {
"use strict";

const PACKAGE_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/extension/uca-extension-chrome.zip";
const DB = "uca_selfupdate", STORE = "kv", KEY = "dir";

function supported(needPicker) { return (!needPicker || typeof root.showDirectoryPicker === "function") && typeof DecompressionStream === "function" && typeof indexedDB !== "undefined"; }

/* ---------- mémorisation du dossier choisi ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function saved() {
  const db = await idb();
  return new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
}
async function remember(handle) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(handle, KEY); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function forget() {
  const db = await idb();
  return new Promise((res) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(KEY); t.oncomplete = res; t.onerror = res; });
}

/* ---------- le dossier est bien celui de l'extension ---------- */
async function readManifest(dir) {
  const f = await (await dir.getFileHandle("manifest.json")).getFile();
  return JSON.parse(await f.text());
}
async function checkFolder(dir) {
  let m;
  try { m = await readManifest(dir); } catch (e) { throw new Error("Ce dossier ne contient pas manifest.json : choisis le dossier de l'extension."); }
  if (!/UCA/.test(String(m.name || ""))) throw new Error("Ce dossier n'est pas celui de l'extension Emploi du temps UCA.");
  return m;
}

async function permission(dir, interactive) {
  const opts = { mode: "readwrite" };
  if ((await dir.queryPermission(opts)) === "granted") return true;
  if (!interactive) return false;
  return (await dir.requestPermission(opts)) === "granted";
}

/* ---------- ZIP : lecture de l'annuaire central, décompression « deflate » ---------- */
function u16(v, o) { return v.getUint16(o, true); }
function u32(v, o) { return v.getUint32(o, true); }
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
function safePath(name) {
  const n = String(name).replace(/\\/g, "/");
  if (!n || n.startsWith("/") || /(^|\/)\.\.(\/|$)/.test(n) || /^[A-Za-z]:/.test(n)) return null;   // jamais hors du dossier
  return n;
}
async function readZip(buf) {
  const bytes = new Uint8Array(buf), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) { if (u32(v, i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error("Paquet illisible (ce n'est pas un ZIP).");
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const td = new TextDecoder(), out = [];
  for (let k = 0; k < count; k++) {
    if (u32(v, p) !== 0x02014b50) throw new Error("ZIP corrompu (annuaire central).");
    const method = u16(v, p + 10), csize = u32(v, p + 20), nlen = u16(v, p + 28), xlen = u16(v, p + 30), clen = u16(v, p + 32), off = u32(v, p + 42);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    const path = safePath(name);
    if (!path) throw new Error("Paquet refusé : chemin suspect « " + name + " ».");
    if (u32(v, off) !== 0x04034b50) throw new Error("ZIP corrompu (en-tête local).");
    const start = off + 30 + u16(v, off + 26) + u16(v, off + 28);
    const raw = bytes.subarray(start, start + csize);
    if (method !== 0 && method !== 8) throw new Error("Méthode de compression non gérée (" + method + ").");
    out.push({ path, read: () => (method === 0 ? Promise.resolve(raw) : inflate(raw)) });
  }
  return out;
}

async function writeFile(root_, path, data) {
  const parts = path.split("/"), file = parts.pop();
  let dir = root_;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
  const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
  await w.write(data); await w.close();
}

/* Écrit tout le ZIP dans le dossier ; manifest.json en dernier (une panne en route laisse l'ancienne version annoncée :
   le verrou de mise à jour reste et on peut réessayer). */
async function applyZip(dir, buf, onProgress) {
  const entries = await readZip(buf);
  const mf = entries.find((e) => e.path === "manifest.json");
  if (!mf) throw new Error("Paquet invalide : pas de manifest.json.");
  const newM = JSON.parse(new TextDecoder().decode(await mf.read()));
  if (!/UCA/.test(String(newM.name || ""))) throw new Error("Paquet inattendu (nom sans « UCA »).");
  const rest = entries.filter((e) => e !== mf);
  let done = 0;
  for (const e of rest) {
    await writeFile(dir, e.path, await e.read());
    done++; if (onProgress) onProgress(done, rest.length + 1, e.path);
  }
  await writeFile(dir, "manifest.json", await mf.read());
  if (onProgress) onProgress(rest.length + 1, rest.length + 1, "manifest.json");
  return newM.version;
}

/* ---------- téléchargement : le service worker (droits d'hôte raw.githubusercontent.com) ou direct ---------- */
async function fetchPackage() {
  if (typeof window === "undefined" || !root.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    const r = await fetch(PACKAGE_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("Téléchargement impossible (HTTP " + r.status + ").");
    return await r.arrayBuffer();
  }
  const res = await chrome.runtime.sendMessage({ type: "UCA_FETCH_PACKAGE" });
  if (!res || !res.ok) throw new Error((res && res.error) || "Téléchargement impossible (connexion ?).");
  const bin = atob(res.b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a.buffer;
}

/* Mise à jour complète. interactive = true : peut ouvrir la boîte « Sélectionner un dossier » et demander l'autorisation
   (à appeler depuis un clic). Renvoie la nouvelle version ; lève une erreur lisible sinon. */
async function run({ interactive, onProgress, pick, getPackage } = {}) {
  if (!supported(!!interactive)) throw new Error("Ce navigateur ne permet pas la mise à jour automatique (Firefox) : suis les étapes manuelles.");
  const step = (t) => { if (onProgress) onProgress(0, 1, t); };
  let dir = await saved();
  if (dir) {
    try { await checkFolder(dir); } catch (e) { await forget(); dir = null; }
  }
  if (dir && !(await permission(dir, interactive))) {
    if (!interactive) return null;   // pas d'autorisation en mode silencieux
    dir = null;
  }
  if (!dir) {
    if (!interactive) return null;
    step("Choix du dossier de l'extension");
    dir = pick ? await pick() : await root.showDirectoryPicker({ id: "uca-extension", mode: "readwrite" });
    await checkFolder(dir);
    if (!(await permission(dir, true))) throw new Error("Autorisation d'écriture refusée : la mise à jour ne peut pas continuer.");
    await remember(dir);
  }
  step("Téléchargement de la dernière version");
  const buf = await (getPackage ? getPackage() : fetchPackage());
  step("Application des changements");
  const version = await applyZip(dir, buf, onProgress);
  return version;
}

async function hasFolder() { try { return !!(await saved()); } catch (e) { return false; } }

root.UCA_SELFUPDATE = { PACKAGE_URL, supported, run, applyZip, readZip, safePath, forget, hasFolder, permission, saved };
})(typeof self !== "undefined" ? self : this);
