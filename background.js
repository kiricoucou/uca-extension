const EDT_URL = "https://odin.iut.uca.fr/etudiants/?p=edt";
const ABSENCES_URL = "https://odin.iut.uca.fr/etudiants/?p=absences";
const NOTES_URL = "https://odin.iut.uca.fr/etudiants/?p=notes";
const CAS_URL = "https://ent.uca.fr/cas/login?service=" + encodeURIComponent("https://odin.iut.uca.fr/portail/");
const DATE_HEADER_RE = /\d{1,2}\s*(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)/i;
const LOGIN_WAIT_MS = 15 * 60 * 1000;

function broadcast(msg) {
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { /* no listener open, fine */ }
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ""; }
}

// Compare le hostname exact : CAS_URL contient "odin.iut.uca.fr" en clair dans ?service=,
// une simple sous-chaîne se déclencherait dès la page de login.
function waitForUrlContains(tabId, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); reject(new Error("timeout")); }
    }, timeoutMs);
    function listener(id, info, tab) {
      if (id !== tabId) return;
      const url = info.url || (tab && tab.url) || "";
      if (hostOf(url) === host) {
        if (!done) { done = true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(url); }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function waitForComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; chrome.tabs.onUpdated.removeListener(listener); reject(new Error("timeout")); }
    }, timeoutMs);
    function listener(id, info) {
      if (id !== tabId) return;
      if (info.status === "complete") {
        if (!done) { done = true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); }
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function extractScheduleText(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (document.body ? document.body.innerText : "")
  });
  return (results && results[0] && results[0].result) || "";
}

/* La page Odin affiche d'abord l'accueil (ou un squelette vide) puis remplace le
   contenu en AJAX une fois l'emploi du temps chargé. "complete" du navigateur
   arrive avant ça : on réessaie l'extraction jusqu'à voir un vrai en-tête de date. */
async function extractScheduleTextWithRetry(tabId, tries, delayMs) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    last = await extractScheduleText(tabId);
    if (DATE_HEADER_RE.test(last)) return last;
    await sleep(delayMs);
  }
  return last;
}

async function navigateAndScrape(tabId) {
  await chrome.tabs.update(tabId, { url: EDT_URL });
  await waitForComplete(tabId, 45000);
  return extractScheduleTextWithRetry(tabId, 60, 1000);
}

async function trySilentResync() {
  broadcast({ type: "UCA_SYNC_PROGRESS", stage: "resync" });
  let tab;
  try {
    tab = await chrome.tabs.create({ url: EDT_URL, active: false });
    await waitForComplete(tab.id, 30000);
    const fresh = await chrome.tabs.get(tab.id);
    const url = fresh.url || "";
    if (hostOf(url) === "ent.uca.fr") {
      await chrome.tabs.remove(tab.id);
      await chrome.storage.local.set({ uca_session_expired: true });
      return null;
    }
    const text = await extractScheduleTextWithRetry(tab.id, 25, 800);
    await chrome.tabs.remove(tab.id);
    return text;
  } catch (e) {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
    return null;
  }
}

async function fullLogin() {
  broadcast({ type: "UCA_SYNC_PROGRESS", stage: "login-opening" });
  const win = await chrome.windows.create({ url: CAS_URL, type: "popup", width: 480, height: 700 });
  const tab = win.tabs[0];
  broadcast({ type: "UCA_SYNC_PROGRESS", stage: "login-waiting" });
  // Popup fermée par l'utilisateur : on abandonne tout de suite (sinon le verrou de
  // synchro resterait pris jusqu'à LOGIN_WAIT_MS et aucun nouveau login ne passerait).
  let onClosed;
  const closed = new Promise((_, reject) => {
    onClosed = (winId) => { if (winId === win.id) reject(new Error("Fenêtre de connexion fermée")); };
    chrome.windows.onRemoved.addListener(onClosed);
  });
  try {
    await Promise.race([waitForUrlContains(tab.id, "odin.iut.uca.fr", LOGIN_WAIT_MS), closed]);
  } finally {
    chrome.windows.onRemoved.removeListener(onClosed);
  }
  broadcast({ type: "UCA_SYNC_PROGRESS", stage: "scraping" });
  const text = await navigateAndScrape(tab.id);
  await chrome.tabs.remove(tab.id);
  return text;
}

/* ============ Absences ============ */
const ABSENCE_LINE_RE = /Nombre d['’]absences?\s*([a-zàéèâî]+(?:\s[a-zàéèâî]+)*)\s*:\s*([\d]+)/gi;
function parseAbsencesText(text) {
  const out = { declarees: null, justifiees: null, nonJustifiees: null, avecMotifs: null, journeesNonJustifiees: null };
  let m; ABSENCE_LINE_RE.lastIndex = 0;
  while ((m = ABSENCE_LINE_RE.exec(text)) !== null) {
    const label = m[1].toLowerCase(); const n = parseInt(m[2], 10);
    if (label.includes("déclar") || label.includes("declar")) out.declarees = n;
    else if (label.includes("non justifi") && label.includes("journ")) out.journeesNonJustifiees = n;
    else if (label.includes("avec motif")) out.avecMotifs = n;
    else if (label.includes("non justifi")) out.nonJustifiees = n;
    else if (label.includes("justifi")) out.justifiees = n;
  }
  return out;
}
async function scrapeAbsences() {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: ABSENCES_URL, active: false });
    await waitForComplete(tab.id, 20000);
    const fresh = await chrome.tabs.get(tab.id);
    if (hostOf(fresh.url || "") === "ent.uca.fr") { await chrome.tabs.remove(tab.id); return null; }
    let text = "";
    for (let i = 0; i < 10; i++) {
      text = await extractScheduleText(tab.id);
      if (/absences?/i.test(text)) break;
      await sleep(500);
    }
    await chrome.tabs.remove(tab.id);
    return parseAbsencesText(text);
  } catch (e) {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
    return null;
  }
}

/* ============ Relevé de notes ============
   Format réel Odin (?p=notes, confirmé) : tableau hiérarchique UE > matière (R1.xx/SAEx.xx)
   > évaluation ("Nom (sur 20.0)"), chaque ligne se terminant par 5 colonnes tabulées
   Coeff/Note/Moy/Maxi/Mini ("-" ou vide si pas encore noté). innerText rend les cellules
   de table séparées par des tabulations (et les cellules vides par deux tabulations
   consécutives), d'où le split sur \t plutôt que sur des espaces. */
function cleanNoteNum(v) {
  if (v === undefined) return null;
  const t = v.trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function parseNotesText(text) {
  const ues = [];
  // Une même matière (R1.01, SAE1.02...) peut apparaître sous plusieurs UE à la fois
  // (elle compte pour le coefficient de chacune) — Odin répète alors la ligne telle
  // quelle. On ne veut l'afficher qu'une fois : dédup par titre exact, on garde la
  // première occurrence rencontrée et on lui rattache les évaluations des occurrences
  // suivantes (au cas où une réapparition apporterait une éval pas encore vue).
  const matiereByLabel = new Map();
  const ueByLabel = new Map();
  let currentUE = null, currentMatiere = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cols = raw.trim().split(/\t| {2,}/);
    const label = (cols[0] || "").trim();
    if (!label || cols.length < 2) continue;
    const [coeff, note, moy, maxi, mini] = cols.slice(1).map((c) => cleanNoteNum(c));
    const row = { label: label.slice(0, 200), coeff, note, moy, maxi, mini };
    if (/^UE\s/.test(label)) {
      if (ueByLabel.has(label)) {
        currentUE = ueByLabel.get(label);
      } else {
        currentUE = { ...row, matieres: [] };
        ues.push(currentUE);
        ueByLabel.set(label, currentUE);
      }
      currentMatiere = null;
    } else if (/^(R|SAE)\d+(\.\d+)*\s*:/.test(label)) {
      if (matiereByLabel.has(label)) {
        currentMatiere = matiereByLabel.get(label);
      } else {
        currentMatiere = { ...row, evals: [], _evalLabels: new Set() };
        matiereByLabel.set(label, currentMatiere);
        if (currentUE) currentUE.matieres.push(currentMatiere);
      }
    } else if (currentMatiere && /\(sur\s*[\d.,]+\)/i.test(label)) {
      if (!currentMatiere._evalLabels.has(label)) {
        currentMatiere._evalLabels.add(label);
        currentMatiere.evals.push(row);
      }
    }
  }
  ues.forEach((u) => u.matieres.forEach((m) => delete m._evalLabels));
  return { ue: ues.slice(0, 100) };
}
async function scrapeNotes() {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: NOTES_URL, active: false });
    await waitForComplete(tab.id, 20000);
    const fresh = await chrome.tabs.get(tab.id);
    if (hostOf(fresh.url || "") === "ent.uca.fr") { await chrome.tabs.remove(tab.id); return null; }
    let text = "";
    for (let i = 0; i < 10; i++) {
      text = await extractScheduleText(tab.id);
      if (/\bCoeff\b/.test(text) && /\bMaxi\b/.test(text)) break;
      await sleep(500);
    }
    await chrome.tabs.remove(tab.id);
    const releve = parseNotesText(text);
    return releve.ue.length ? releve : null;
  } catch (e) {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
    return null;
  }
}

/* ============ Mini parseur texte (duplique la logique du site) ============ */
const MONTH_INDEX = {
  "janvier": 0, "février": 1, "fevrier": 1, "mars": 2, "avril": 3, "mai": 4, "juin": 5,
  "juillet": 6, "août": 7, "aout": 7, "septembre": 8, "octobre": 9, "novembre": 10, "décembre": 11, "decembre": 11
};
function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(y, mo, d) { return y + "-" + pad(mo + 1) + "-" + pad(d); }
function colorFor(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return `hsl(${h % 360},68%,40%)`; }
function parseScheduleText(raw) {
  const text = raw.replace(/\?\?/g, "é").replace(/[ \t]+/g, " ").replace(/ /g, " ");
  const dayNamesAlt = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
  const monthsAlt = Object.keys(MONTH_INDEX).sort((a, b) => b.length - a.length).join("|");
  const dateHeaderRe = new RegExp(`(${dayNamesAlt})\\s+(\\d{1,2})\\s+(${monthsAlt})\\s+(\\d{4})`, "gi");
  const headers = []; let m;
  while ((m = dateHeaderRe.exec(text)) !== null) {
    headers.push({ index: m.index, end: m.index + m[0].length, day: parseInt(m[2], 10), month: MONTH_INDEX[m[3].toLowerCase()], year: parseInt(m[4], 10) });
  }
  if (headers.length === 0) return [];
  const timeSlotRe = /(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})/g;
  const events = [];
  for (let hIdx = 0; hIdx < headers.length; hIdx++) {
    const h = headers[hIdx];
    const blockEnd = hIdx + 1 < headers.length ? headers[hIdx + 1].index : text.length;
    const block = text.slice(h.end, blockEnd);
    const slots = []; let sm; timeSlotRe.lastIndex = 0;
    while ((sm = timeSlotRe.exec(block)) !== null) slots.push({ index: sm.index, end: sm.index + sm[0].length, sh: sm[1], sm_: sm[2], eh: sm[3], em: sm[4] });
    for (let sIdx = 0; sIdx < slots.length; sIdx++) {
      const s = slots[sIdx];
      const contentEnd = sIdx + 1 < slots.length ? slots[sIdx + 1].index : block.length;
      const content = block.slice(s.end, contentEnd);
      const teacherMatch = content.match(/enseignants?\s*:\s*([\s\S]+?)(?=(salle\s*:)|$)/i);
      const roomMatch = content.match(/salle\s*:\s*([\s\S]+?)(?=(\d{1,2}[:h]\d{2}\s*-)|$)/i);
      const teacher = teacherMatch ? teacherMatch[1].replace(/\s+/g, " ").trim() : "";
      const room = roomMatch ? roomMatch[1].replace(/\s+/g, " ").trim() : "";
      let titlePart = content;
      const encIdx = content.search(/enseignants?\s*:/i);
      if (encIdx >= 0) titlePart = content.slice(0, encIdx);
      const title = titlePart.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const raw = content.replace(/\n{2,}/g, "\n").trim();
      events.push({
        date: dateKey(h.year, h.month, h.day), year: h.year, month: h.month, day: h.day,
        startH: parseInt(s.sh, 10), startM: parseInt(s.sm_, 10), endH: parseInt(s.eh, 10), endM: parseInt(s.em, 10),
        title, teacher, room, raw, color: colorFor(title.replace(/\b(CM|TD|TDA|TP|TPA)\b/gi, "").trim() || title)
      });
    }
  }
  return events;
}

async function storeResult(text) {
  const events = parseScheduleText(text);
  await chrome.storage.local.set({ uca_events: events, uca_last_sync: new Date().toISOString() });
  return events;
}

async function syncAbsencesQuietly() {
  const absences = await scrapeAbsences();
  if (absences) {
    await chrome.storage.local.set({ uca_absences: absences, uca_absences_sync: new Date().toISOString() });
    broadcast({ type: "UCA_ABSENCES_RESULT", ok: true, absences });
  }
}

async function syncNotesQuietly() {
  const releve = await scrapeNotes();
  if (releve) {
    await chrome.storage.local.set({ uca_releve_notes: releve, uca_releve_notes_sync: new Date().toISOString() });
    broadcast({ type: "UCA_NOTES_RESULT", ok: true, releve });
  }
}

async function handleSync(mode) {
  let text = null;
  if (mode === "resync") {
    text = await trySilentResync();
    if (text && DATE_HEADER_RE.test(text)) {
      const events = await storeResult(text);
      await chrome.storage.local.set({ uca_session_expired: false });
      broadcast({ type: "UCA_SYNC_RESULT", ok: true, text, events, silent: true });
      await syncAbsencesQuietly();
      await syncNotesQuietly();
      return;
    }
  }
  text = await fullLogin();
  if (!text || !DATE_HEADER_RE.test(text)) {
    broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: "Aucun emploi du temps détecté sur la page." });
    return;
  }
  const events = await storeResult(text);
  await chrome.storage.local.set({ uca_session_expired: false });
  broadcast({ type: "UCA_SYNC_RESULT", ok: true, text, events, silent: false });
  await syncAbsencesQuietly();
  await syncNotesQuietly();
}

let syncInProgress = false;
let lastSyncRequestAt = 0;
const ALLOWED_SYNC_MODES = new Set(["resync", "login"]);
// Une page matchée par le content script (localhost, file://) peut envoyer des demandes :
// on limite le débit pour qu'elle ne puisse pas ouvrir onglets/popups CAS en boucle.
const PAGE_SYNC_COOLDOWN_MS = 30 * 1000;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "UCA_SYNC_REQUEST") return false;
  if (!ALLOWED_SYNC_MODES.has(msg.mode)) return false;
  if (syncInProgress) {
    broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: "Synchronisation déjà en cours" });
    return false;
  }
  const fromPage = !!sender.tab;
  const now = Date.now();
  if (fromPage && now - lastSyncRequestAt < PAGE_SYNC_COOLDOWN_MS) {
    broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: "Patiente quelques secondes avant de resynchroniser" });
    return false;
  }
  lastSyncRequestAt = now;
  syncInProgress = true;
  handleSync(msg.mode)
    .catch((err) => {
      broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: String((err && err.message) || err) });
    })
    .finally(() => { syncInProgress = false; });
  return false;
});
