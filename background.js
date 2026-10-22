// Firefox charge core/settings.js via manifest.background.scripts ; Chrome (service worker) ici.
if (typeof UCA_getSettings === "undefined" && typeof importScripts === "function") importScripts("core/settings.js");
if (typeof UCA_GRADES === "undefined" && typeof importScripts === "function") importScripts("core/grades.js");
if (typeof UCA_STATUS === "undefined" && typeof importScripts === "function") importScripts("core/status.js");

const EDT_URL = "https://odin.iut.uca.fr/etudiants/?p=edt";
const ABSENCES_URL = "https://odin.iut.uca.fr/etudiants/?p=absences";
const NOTES_URL = "https://odin.iut.uca.fr/etudiants/?p=notes";
const CAS_URL = "https://ent.uca.fr/cas/login?service=" + encodeURIComponent("https://odin.iut.uca.fr/portail/");
const DATE_HEADER_RE = /\d{1,2}\s*(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)/i;
const LOGIN_WAIT_MS = 15 * 60 * 1000;
// Après un échec réel (pas une annulation), le bouton Synchroniser reste visuellement désactivé
// ce temps-là avant de réapparaître : évite de marteler une resynchro si Odin est en panne.
const SYNC_RETRY_COOLDOWN_MS = 10 * 1000;
// Odin lui-même peut répondre par une page d'erreur (service en panne, maintenance...) plutôt que
// par l'emploi du temps : repéré dans le texte de la page pour arrêter d'attendre tout de suite
// (sinon on patiente jusqu'au bout des relances en pensant que la page finira par se charger).
function looksLikeServiceError(text) {
  if (!text) return false;
  const head = text.slice(0, 500);
  return /\b(404|500|502|503|504)\b/.test(head)
    || /page (introuvable|non trouv[ée]e)|erreur (serveur|interne)|service (indisponible|temporairement indisponible)|site (indisponible|en maintenance)|maintenance en cours|internal server error|not found|service unavailable|bad gateway|gateway timeout/i.test(head);
}

/* Notifications : absentes de Firefox pour Android (l'extension y fonctionne, sans alertes système). */
function notify(id, options) {
  if (typeof chrome.notifications === "undefined" || !chrome.notifications.create) return;
  try { chrome.notifications.create(id, options); } catch (e) { /* une notification ratée ne doit jamais casser une synchro */ }
}

function broadcast(msg) {
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (e) { /* no listener open, fine */ }
}

/* ============ Vérification de mise à jour (dépôt GitHub) ============
   Compare la version chargée (chrome.runtime.getManifest().version, figée en mémoire
   depuis le dernier chargement/reload de l'extension) au manifest.json de la branche
   main sur GitHub. Vérifié au démarrage puis toutes les 20 min via chrome.alarms.
   Important : une extension chargée "non empaquetée" ne peut pas se réécrire elle-même
   depuis du JS (aucune API Chrome ne le permet, et ce serait de l'exécution de code
   distant non vérifié). "Mettre à jour" ne peut donc que recharger l'extension depuis
   les fichiers déjà présents sur le disque (chrome.runtime.reload()) — si le dossier
   local n'a pas été mis à jour (git pull / nouveau téléchargement), le reload seul ne
   suffit pas. Voir UPDATES.md à la racine du dépôt. */
const MANIFEST_RAW_URL = "https://raw.githubusercontent.com/kiricoucou/uca-extension/main/manifest.json";
const UPDATE_ALARM = "uca_update_check";

function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Un essai, sans effet de bord sur le stockage : juste "ça a marché ou pas".
async function fetchLatestVersion() {
  const res = await fetch(MANIFEST_RAW_URL + "?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const remote = await res.json();
  if (!remote || !remote.version) throw new Error("manifest.json sans version");
  return remote.version;
}

/* Paquet des magasins (addons.mozilla.org, Chrome Web Store) : le fichier store-build.txt n'existe que dans
   ce paquet (tests/build_firefox.py --store). Le magasin gère les mises à jour : pas de comparaison avec GitHub,
   pas de bouton « Mettre à jour ». */
let storeBuild = null;
async function isStoreBuild() {
  if (storeBuild === null) {
    try { storeBuild = (await fetch(chrome.runtime.getURL("store-build.txt"))).ok; } catch (e) { storeBuild = false; }
  }
  return storeBuild;
}

async function checkForUpdate() {
  const current = chrome.runtime.getManifest().version;
  if (await isStoreBuild()) {
    await chrome.storage.local.set({ uca_store_build: true, uca_current_version: current, uca_update_available: false, uca_update_check_failed: null });
    broadcast({ type: "UCA_UPDATE_STATE", current, latest: current, updateAvailable: false });
    return;
  }
  chrome.storage.local.remove("uca_store_build");
  let latest = null, lastError = null;
  // Un échec isolé (réseau lent, DNS...) ne doit pas faire croire que la vérification "ne marche
  // pas" : un deuxième essai après une courte pause avant d'abandonner et de le signaler vraiment.
  for (let i = 0; i < 2 && !latest; i++) {
    if (i) await sleep(1200);
    try { latest = await fetchLatestVersion(); } catch (e) { lastError = e; }
  }
  if (!latest) {
    await chrome.storage.local.set({ uca_update_check_failed: String(lastError), uca_update_checked_at: new Date().toISOString() });
    broadcast({ type: "UCA_UPDATE_STATE", current, latest: null, updateAvailable: false, error: String(lastError) });
    return;
  }
  const updateAvailable = compareVersions(current, latest) < 0;
  await chrome.storage.local.set({
    uca_current_version: current,
    uca_latest_version: latest,
    uca_update_available: updateAvailable,
    uca_update_checked_at: new Date().toISOString(),
    uca_update_check_failed: null,
  });
  broadcast({ type: "UCA_UPDATE_STATE", current, latest, updateAvailable });
}

/* « Mettre à jour » : recharger ne sert que si les fichiers sur le disque sont déjà plus récents
   (git pull, nouveau dossier décompressé). manifest.json est relu sur le disque (fetch, pas
   getManifest() qui reste figé) : s'il est encore ancien, on ouvre la page d'aide qui explique
   comment récupérer la nouvelle version au lieu d'un rechargement qui ne changerait rien. */
const HELP_UPDATE_URL = "https://kiricoucou.github.io/uca-extension/aide.html#maj-extension";
async function applyExtensionUpdate() {
  if (await isStoreBuild()) return;
  try {
    const disk = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json();
    const { uca_latest_version } = await chrome.storage.local.get("uca_latest_version");
    if (uca_latest_version && compareVersions(disk.version, uca_latest_version) < 0) {
      await chrome.tabs.create({ url: HELP_UPDATE_URL });
      return;
    }
  } catch (e) { /* on tente quand même le rechargement */ }
  chrome.runtime.reload();
}

/* ============ Design choisi (registre designs/designs.json) ============
   Chaque design est un dossier (HTML/CSS/assets + design.js) ; la logique est dans core/.
   L'id choisi est stocké dans uca_design ; un id absent du registre renvoie au sélecteur. */
const ICON_SIZES = [16, 32, 48, 128];
function iconPaths(dir) {
  const out = {};
  ICON_SIZES.forEach((s) => { out[s] = `${dir}/icon${s}.png`; });
  return out;
}
async function loadDesigns() {
  const res = await fetch(chrome.runtime.getURL("designs/designs.json"));
  return res.json();
}
async function applyDesign() {
  const [{ uca_design }, designs] = await Promise.all([chrome.storage.local.get("uca_design"), loadDesigns()]);
  const design = designs.find((d) => d.id === uca_design);
  if (!design) {
    await chrome.action.setPopup({ popup: "choose.html" });
    await chrome.action.setIcon({ path: iconPaths("icons") });
    return null;
  }
  await chrome.action.setPopup({ popup: `${design.folder}/popup.html` });
  await chrome.action.setIcon({ path: iconPaths(`${design.folder}/icons`) });
  return design;
}
async function setDesign(id) {
  const designs = await loadDesigns();
  if (!designs.some((d) => d.id === id)) throw new Error("Design inconnu : " + id);
  await chrome.storage.local.set({ uca_design: id });
  return applyDesign();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "UCA_SET_DESIGN") return false;
  setDesign(msg.id)
    .then((design) => sendResponse({ ok: true, folder: design.folder }))
    .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("choose.html?tab=1") });
});
chrome.runtime.onStartup.addListener(applyDesign);
applyDesign();

chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 20 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === UPDATE_ALARM) checkForUpdate(); });
chrome.runtime.onStartup.addListener(checkForUpdate);
chrome.runtime.onInstalled.addListener(checkForUpdate);
checkForUpdate();

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ""; }
}

// Compare le hostname exact : CAS_URL contient "odin.iut.uca.fr" en clair dans ?service=,
// une simple sous-chaîne se déclencherait dès la page de login.
// Interroge l'onglet chaque seconde au lieu d'attendre un événement onUpdated : quand la session
// CAS est déjà ouverte, la redirection vers Odin peut finir avant que l'écouteur soit posé, et
// l'événement est alors perdu (la fenêtre restait sur Odin sans que rien ne se passe).
// loginDone : l'utilisateur a cliqué "J'y suis" (UCA_LOGIN_DONE), on arrête d'attendre.
let loginDone = null;
async function waitForUrlContains(tabId, host, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let manual = false;
  loginDone = () => { manual = true; };
  try {
    while (Date.now() < end) {
      const tab = await chrome.tabs.get(tabId);
      if (hostOf(tab.url || tab.pendingUrl || "") === host || manual) return tab.url;
      await sleep(1000);
    }
    throw new Error("timeout");
  } finally { loginDone = null; }
}

async function waitForComplete(tabId, timeoutMs) {
  const end = Date.now() + timeoutMs;
  await sleep(300);
  while (Date.now() < end) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(500);
  }
  throw new Error("timeout");
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
    if (looksLikeServiceError(last)) {
      const e = new Error("Le service Odin semble indisponible (erreur renvoyée par le site).");
      e.serviceDown = true;
      throw e;
    }
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
  let tab, closedByUser = false;
  // L'onglet silencieux (active:false) reste visible dans la barre d'onglets : un utilisateur
  // peut le fermer en le prenant pour une erreur. Fermeture détectée -> annulation nette plutôt
  // que de laisser le code suivant échouer en silence et enchaîner sur une fenêtre de connexion
  // complète surprise (voir trySilentResync catch ci-dessous et handleSync).
  const onRemoved = (tabId) => { if (tab && tabId === tab.id) closedByUser = true; };
  chrome.tabs.onRemoved.addListener(onRemoved);
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
    if (closedByUser) { const err = new Error("Synchronisation annulée."); err.cancelled = true; throw err; }
    if (e && e.serviceDown) throw e;
    return null;
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
  }
}

async function fullLogin() {
  broadcast({ type: "UCA_SYNC_PROGRESS", stage: "login-opening" });
  // Sans API windows (Firefox pour Android) : la connexion se fait dans un onglet normal.
  const useWindow = typeof chrome.windows !== "undefined" && !!chrome.windows.create && !!chrome.windows.onRemoved;
  let surface, tab;
  if (useWindow) { surface = await chrome.windows.create({ url: CAS_URL, type: "popup", width: 480, height: 700 }); tab = surface.tabs[0]; }
  else { tab = await chrome.tabs.create({ url: CAS_URL, active: true }); surface = { id: tab.id }; }
  const removed = useWindow ? chrome.windows.onRemoved : chrome.tabs.onRemoved;
  let closedByUser = false;
  const onClosed = (id) => { if (id === surface.id) closedByUser = true; };
  removed.addListener(onClosed);
  try {
    broadcast({ type: "UCA_SYNC_PROGRESS", stage: "login-waiting" });
    // Fenêtre (ou onglet) fermée par l'utilisateur pendant l'attente de connexion : on abandonne tout de suite
    // (sinon le verrou de synchro resterait pris jusqu'à LOGIN_WAIT_MS et aucune nouvelle synchro
    // ne passerait). Fermée plus tard (pendant navigateAndScrape ci-dessous) : les appels sur cet
    // onglet échouent naturellement, repérés via closedByUser dans le catch.
    let onRaceClosed;
    const closed = new Promise((_, reject) => {
      onRaceClosed = (id) => { if (id === surface.id) { const e = new Error("Fenêtre de connexion fermée."); e.cancelled = true; reject(e); } };
      removed.addListener(onRaceClosed);
    });
    try {
      await Promise.race([waitForUrlContains(tab.id, "odin.iut.uca.fr", LOGIN_WAIT_MS), closed]);
    } finally {
      removed.removeListener(onRaceClosed);
    }
    broadcast({ type: "UCA_SYNC_PROGRESS", stage: "scraping" });
    const text = await navigateAndScrape(tab.id);
    await chrome.tabs.remove(tab.id);
    return text;
  } catch (e) {
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    if (closedByUser && !e.cancelled) { const err = new Error("Fenêtre de connexion fermée."); err.cancelled = true; throw err; }
    throw e;
  } finally {
    removed.removeListener(onClosed);
  }
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
/* Liste des déclarations d'absence (bloc caché #id_liste_justifications d'Odin, format
   confirmé) : « • Du JJ/MM/AAAA à HHhMM au JJ/MM/AAAA à HHhMM (Déposée le JJ/MM/AAAA à HHhMM)
   [icône de statut, texte dans alt/title] Motif : … ». Odin ne détaille pas les absences
   relevées sans déclaration (seulement leur nombre). */
const DECLARATION_RE = /Du\s+(\d{2}\/\d{2}\/\d{4})\s+à\s+(\d{1,2})h(\d{2})\s+au\s+(\d{2}\/\d{2}\/\d{4})\s+à\s+(\d{1,2})h(\d{2})\s*\(\s*Déposée le\s+(\d{2}\/\d{2}\/\d{4})\s+à\s+(\d{1,2})h(\d{2})\s*\)\s*(?:Motif\s*:\s*(.*))?/i;
function isoFromFr(d, h, m) { const [dd, mm, yy] = d.split("/"); return `${yy}-${mm}-${dd}T${String(h).padStart(2, "0")}:${m}`; }
function declarationStatus(label) {
  const l = (label || "").toLowerCase();
  if (/refus|rejet/.test(l)) return "refusee";
  if (/attente|cours d'examen|à traiter/.test(l)) return "attente";
  if (/justifi|valid/.test(l)) return "justifiee";
  return label ? "autre" : "inconnu";
}
function parseDeclarations(entries) {
  return (entries || []).map((e) => {
    const m = e.text.match(DECLARATION_RE);
    if (!m) return null;
    return {
      debut: isoFromFr(m[1], m[2], m[3]), fin: isoFromFr(m[4], m[5], m[6]), depose: isoFromFr(m[7], m[8], m[9]),
      motif: (m[10] || "").trim().slice(0, 300), statut: declarationStatus(e.status), statutLibelle: (e.status || "").slice(0, 200),
    };
  }).filter(Boolean).sort((a, b) => b.debut.localeCompare(a.debut));
}
async function extractDeclarations(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const box = document.getElementById("id_liste_justifications");
        if (!box) return null;
        const entries = []; let cur = null;
        box.childNodes.forEach((n) => {
          if (n.nodeType === 3 && n.textContent.includes("•")) { cur = { parts: [], status: "" }; entries.push(cur); }
          if (!cur) return;
          if (n.nodeType === 1 && n.tagName === "IMG") cur.status = n.alt || n.title || "";
          else cur.parts.push(n.textContent);
        });
        return entries.map((e) => ({ text: e.parts.join(" ").replace(/\s+/g, " ").trim(), status: e.status }));
      },
    });
    return res && res.result ? parseDeclarations(res.result) : null;
  } catch (e) {
    return null;
  }
}

/* Page Odin secondaire (absences, notes) : { text, issue }. issue = "session" (renvoyé vers CAS),
   "serviceDown" (page d'erreur d'Odin), "structure" (page chargée mais contenu attendu absent :
   Odin a changé, ou page vide), "error" (onglet fermé, délai dépassé...), ou null si tout va bien.
   Ne lève jamais : l'appelant garde alors les anciennes données. */
async function scrapeOdinPage(url, isReady, extra) {
  let tab;
  const t0 = Date.now();
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForComplete(tab.id, 20000);
    const fresh = await chrome.tabs.get(tab.id);
    if (hostOf(fresh.url || "") === "ent.uca.fr") { await chrome.tabs.remove(tab.id); return { text: "", issue: "session" }; }
    let text = "", ready = false;
    for (let i = 0; i < 10; i++) {
      text = await extractScheduleText(tab.id);
      if (isReady(text)) { ready = true; break; }
      if (looksLikeServiceError(text) && text.trim().length < 800) break;
      await sleep(500);
    }
    const more = ready && extra ? await extra(tab.id) : null;
    await chrome.tabs.remove(tab.id);
    if (ready) return { text, more, issue: null };
    return { text, issue: looksLikeServiceError(text) && text.trim().length < 800 ? "serviceDown" : "structure" };
  } catch (e) {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch (_) {} }
    return { text: "", issue: "error", detail: String((e && e.message) || e).slice(0, 80), ms: Date.now() - t0 };
  }
}

async function scrapeAbsences() {
  const r = await scrapeOdinPage(ABSENCES_URL, (t) => /absences?/i.test(t), extractDeclarations);
  if (r.issue) return { data: null, issue: r.issue, detail: r.detail };
  const out = parseAbsencesText(r.text);
  if (r.more) out.declarations = r.more;
  // Page lue mais aucun compteur reconnu : Odin a changé son affichage.
  const known = ["declarees", "justifiees", "nonJustifiees"].some((k) => out[k] !== null && out[k] !== undefined);
  return known ? { data: out, issue: null } : { data: null, issue: "structure" };
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
  // Deux évaluations de même libellé dans une même matière (ex. deux « Contrôle (sur 20) ») sont
  // deux notes distinctes : la 2e reçoit la clé « libellé #2 ». Une matière répétée sous une autre
  // UE ne rajoute que les évaluations de rang pas encore vu.
  const matiereByLabel = new Map();
  const ueByLabel = new Map();
  let currentUE = null, currentMatiere = null, occCounts = new Map();
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
      occCounts = new Map();
      if (matiereByLabel.has(label)) {
        currentMatiere = matiereByLabel.get(label);
        if (currentMatiere.note == null && row.note != null) Object.assign(currentMatiere, { coeff: row.coeff, note: row.note, moy: row.moy, maxi: row.maxi, mini: row.mini });
      } else {
        currentMatiere = { ...row, evals: [], _evalKeys: new Set() };
        matiereByLabel.set(label, currentMatiere);
        if (currentUE) currentUE.matieres.push(currentMatiere);
      }
    } else if (currentMatiere && /\(sur\s*[\d.,]+\)/i.test(label)) {
      const n = (occCounts.get(label) || 0) + 1;
      occCounts.set(label, n);
      const key = n > 1 ? `${row.label} #${n}` : row.label;
      if (!currentMatiere._evalKeys.has(key)) {
        currentMatiere._evalKeys.add(key);
        currentMatiere.evals.push({ ...row, key });
      }
    }
  }
  ues.forEach((u) => u.matieres.forEach((m) => delete m._evalKeys));
  return { ue: ues.slice(0, 100) };
}
async function scrapeNotes() {
  const r = await scrapeOdinPage(NOTES_URL, (t) => /\bCoeff\b/.test(t) && /\bMaxi\b/.test(t));
  if (r.issue) return { data: null, issue: r.issue, detail: r.detail };
  const releve = parseNotesText(r.text);
  return releve.ue.length ? { data: releve, issue: null } : { data: null, issue: "structure" };
}

/* ============ Mini parseur texte (duplique la logique du site) ============ */
const MONTH_INDEX = {
  "janvier": 0, "février": 1, "fevrier": 1, "mars": 2, "avril": 3, "mai": 4, "juin": 5,
  "juillet": 6, "août": 7, "aout": 7, "septembre": 8, "octobre": 9, "novembre": 10, "décembre": 11, "decembre": 11
};
function pad(n) { return String(n).padStart(2, "0"); }
function dateKey(y, mo, d) { return y + "-" + pad(mo + 1) + "-" + pad(d); }
const EVENT_PALETTE = ["#1967d2","#0b8043","#8e24aa","#c5221f","#b06000","#3f51b5","#00796b","#ad1457","#5f6368","#795548"];
function colorFor(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return EVENT_PALETTE[h % EVENT_PALETTE.length]; }
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
  const { uca_events } = await chrome.storage.local.get("uca_events");
  const lastSync = new Date().toISOString();
  await chrome.storage.local.set({ uca_events: events, uca_last_sync: lastSync });
  await applyEdtChanges(uca_events || [], events);
  return { events, lastSync };
}

/* Journal de diagnostic local (200 lignes max) : codes et durées seulement, jamais de contenu de page,
   de nom, de note ni d'identifiant. Copiable depuis Paramètres pour signaler un bug. */
const DIAG_MAX = 200;
async function diag(event, detail) {
  try {
    const { uca_diag_log } = await chrome.storage.local.get("uca_diag_log");
    const log = (uca_diag_log || []).concat({ at: Date.now(), event, detail: detail || "" }).slice(-DIAG_MAX);
    await chrome.storage.local.set({ uca_diag_log: log });
  } catch (e) { /* le journal ne doit jamais casser une synchro */ }
}
const ISSUE_LABEL = { session: "session expirée", serviceDown: "Odin indisponible", structure: "page non reconnue (Odin a peut-être changé)", error: "erreur de chargement" };

/* Mémorise (ou efface) le problème rencontré sur une page secondaire ; les anciennes données restent. */
async function recordScrapeIssue(kind, r) {
  const { uca_scrape_issues } = await chrome.storage.local.get("uca_scrape_issues");
  const issues = Object.assign({}, uca_scrape_issues);
  if (r.issue) { issues[kind] = { issue: r.issue, at: Date.now() }; await diag("scrape-" + kind, r.issue + (r.detail ? " : " + r.detail : "")); }
  else delete issues[kind];
  await chrome.storage.local.set({ uca_scrape_issues: issues });
}

/* Alerte d'absences (réglage absenceAlert) : une notification chaque fois que le nombre d'absences non
   justifiées atteint le seuil ou le dépasse (une seule par valeur) ; repasser sous le seuil la réarme. */
async function checkAbsenceAlert(absences) {
  const settings = await UCA_getSettings(), th = Number(settings.absenceAlert) || 0, n = absences.nonJustifiees || 0;
  const { uca_absence_alert } = await chrome.storage.local.get("uca_absence_alert");
  const last = (uca_absence_alert && uca_absence_alert.count) || 0;
  if (!th || n < th) { if (last) await chrome.storage.local.remove("uca_absence_alert"); return; }
  if (n <= last) return;
  await chrome.storage.local.set({ uca_absence_alert: { count: n, at: Date.now() } });
  const design = await currentDesign();
  notify("uca_absence|" + Date.now(), {
    type: "basic",
    iconUrl: chrome.runtime.getURL(`${design ? design.folder + "/icons" : "icons"}/icon128.png`),
    title: `${n} absence${n > 1 ? "s" : ""} non justifiée${n > 1 ? "s" : ""}`,
    message: `Le seuil d'alerte (${th}) est atteint. Pense à déposer un justificatif sur Odin.`,
    priority: 1,
  });
}

async function syncAbsencesQuietly() {
  const r = await scrapeAbsences();
  await recordScrapeIssue("absences", r);
  if (r.data) {
    const sync = new Date().toISOString();
    await chrome.storage.local.set({ uca_absences: r.data, uca_absences_sync: sync });
    broadcast({ type: "UCA_ABSENCES_RESULT", ok: true, absences: r.data, sync });
    await checkAbsenceAlert(r.data);
  }
}

/* Odin ne date pas les notes : on retient quand chaque note est vue pour la première fois
   (ou quand sa valeur change) pour signaler les notes récentes. Clé : "matière|évaluation"
   ("matière|" pour la note de matière). Au tout premier relevé, tout compte comme ancien. */
async function recordNotesSeen(releve) {
  const { uca_notes_seen } = await chrome.storage.local.get("uca_notes_seen");
  const seen = uca_notes_seen || {};
  const at = uca_notes_seen ? Date.now() : 0;
  // Relevés vus avant le suivi des notes d'UE et des évaluations homonymes (« #2 ») : ces clés
  // apparaissent d'un coup sans être nouvelles — comptées comme anciennes une seule fois.
  const migrating = !!uca_notes_seen && seen.__v !== 2;
  seen.__v = 2;
  const fresh = [];
  const markAndTrack = (key, note, label) => {
    if (note === null || note === undefined) return;
    if (seen[key] && seen[key].note === note) return;
    const legacy = migrating && !seen[key] && (key.startsWith("UE|") || / #\d+$/.test(key));
    seen[key] = { note, at: legacy ? 0 : at };
    if (at && !legacy) fresh.push({ label, note });
  };
  releve.ue.forEach((ue) => {
    markAndTrack("UE|" + ue.label, ue.note, ue.label);
    (ue.matieres || []).forEach((m) => {
      markAndTrack(m.label + "|", m.note, m.label);
      (m.evals || []).forEach((e) => markAndTrack(m.label + "|" + (e.key || e.label), e.note, `${e.label.replace(/\s*\(sur[^)]*\)/i, "")} — ${m.label}`));
    });
  });
  await chrome.storage.local.set({ uca_notes_seen: seen });
  if (fresh.length) await notifyNewGrades(fresh);
  return fresh;
}

async function syncNotesQuietly() {
  const r = await scrapeNotes();
  await recordScrapeIssue("notes", r);
  if (r.data) {
    const releve = r.data;
    await recordNotesSeen(releve);
    const sync = new Date().toISOString();
    await chrome.storage.local.set({ uca_releve_notes: releve, uca_releve_notes_sync: sync });
    const { uca_notes_seen, uca_notes_history } = await chrome.storage.local.get(["uca_notes_seen", "uca_notes_history"]);
    // Historique de la moyenne générale : un point seulement quand elle change.
    const history = UCA_GRADES.nextHistory(uca_notes_history, releve, Date.now());
    if (history) await chrome.storage.local.set({ uca_notes_history: history });
    broadcast({ type: "UCA_NOTES_RESULT", ok: true, releve, sync, notesSeen: uca_notes_seen || {}, notesHistory: history || uca_notes_history || [] });
  }
}

async function syncSucceeded(text, silent) {
  const { events, lastSync } = await storeResult(text);
  await diag("sync-ok", `${silent ? "silencieuse" : "connexion"} · ${events.length} cours`);
  await chrome.storage.local.set({ uca_session_expired: false });
  const { uca_edt_changes } = await chrome.storage.local.get("uca_edt_changes");
  broadcast({ type: "UCA_SYNC_RESULT", ok: true, text, events, lastSync, silent, edtChanges: uca_edt_changes || [] });
  await syncAbsencesQuietly();
  await syncNotesQuietly();
}

/* mode "background" (synchro automatique) : uniquement la reconnexion silencieuse,
   jamais la fenêtre CAS. Session expirée : trySilentResync met uca_session_expired. */
async function handleSync(mode) {
  let text = null;
  if (mode === "resync" || mode === "background") {
    try {
      text = await trySilentResync();
    } catch (e) {
      // "background" (synchro auto) : échec silencieux, elle réessaiera à la prochaine alarme.
      // "resync" (bouton) : annulation ou service Odin en panne -> remonte tel quel, sans jamais
      // enchaîner sur une fenêtre de connexion complète que l'utilisateur n'a pas demandée.
      await diag("sync-echec", `${mode} : ${e && e.serviceDown ? "Odin indisponible" : e && e.cancelled ? "annulée" : String((e && e.message) || e).slice(0, 80)}`);
      if (mode === "background") return;
      throw e;
    }
    if (text && DATE_HEADER_RE.test(text)) { await syncSucceeded(text, true); return; }
    if (mode === "background") return;
  }
  text = await fullLogin();
  if (!text || !DATE_HEADER_RE.test(text)) {
    broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: "Aucun emploi du temps détecté sur la page.", retryAfterMs: SYNC_RETRY_COOLDOWN_MS });
    return;
  }
  await syncSucceeded(text, false);
}

/* ============ Session cookie (durée restante / déconnexion) ============ */
const SESSION_DOMAINS = ["ent.uca.fr", "odin.iut.uca.fr"];
async function getSessionCookies() {
  const all = [];
  for (const domain of SESSION_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    all.push(...cookies);
  }
  return all;
}
async function getSessionMsRemaining() {
  const cookies = await getSessionCookies();
  if (!cookies.length) return null;
  let maxExp = null;
  cookies.forEach((c) => { if (c.expirationDate) maxExp = Math.max(maxExp || 0, c.expirationDate); });
  if (!maxExp) return null;
  return Math.max(0, Math.round(maxExp * 1000 - Date.now()));
}
async function doLogout() {
  const cookies = await getSessionCookies();
  for (const c of cookies) {
    const url = (c.secure ? "https://" : "http://") + c.domain.replace(/^\./, "") + c.path;
    try { await chrome.cookies.remove({ url, name: c.name }); } catch (e) { /* cookie déjà parti */ }
  }
  await chrome.storage.local.set({ uca_session_expired: true });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "UCA_SESSION_INFO_REQUEST") return false;
  getSessionMsRemaining().then((ms) => sendResponse({ ms })).catch(() => sendResponse({ ms: null }));
  return true;
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "UCA_LOGOUT_REQUEST") return false;
  doLogout().then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return false;
  if (msg.type === "UCA_FORCE_UPDATE_CHECK") { checkForUpdate(); return false; }
  if (msg.type === "UCA_LOGIN_DONE") { if (loginDone) loginDone(); return false; }
  if (msg.type === "UCA_APPLY_UPDATE") { applyExtensionUpdate(); return false; }
  return false;
});

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
      const cancelled = !!(err && err.cancelled);
      broadcast({ type: "UCA_SYNC_RESULT", ok: false, error: String((err && err.message) || err), cancelled, retryAfterMs: cancelled ? 0 : SYNC_RETRY_COOLDOWN_MS });
    })
    .finally(() => { syncInProgress = false; });
  return false;
});

/* ============ Rappels, synchro automatique, pastille ============ */
const REMINDER_PREFIX = "uca_rem|";
const AUTO_SYNC_ALARM = "uca_auto_sync";
const BADGE_ALARM = "uca_badge";

function eventKey(ev) { return ev.date + "_" + pad(ev.startH) + ":" + pad(ev.startM) + "_" + ev.title; }
function eventStart(ev) { return new Date(ev.year, ev.month, ev.day, ev.startH, ev.startM).getTime(); }
function eventEnd(ev) { return new Date(ev.year, ev.month, ev.day, ev.endH, ev.endM).getTime(); }

async function currentDesign() {
  const [{ uca_design }, designs] = await Promise.all([chrome.storage.local.get("uca_design"), loadDesigns()]);
  return designs.find((d) => d.id === uca_design) || null;
}

async function scheduleReminders() {
  const [settings, { uca_events }, alarms] = await Promise.all([UCA_getSettings(), chrome.storage.local.get("uca_events"), chrome.alarms.getAll()]);
  await Promise.all(alarms.filter((a) => a.name.startsWith(REMINDER_PREFIX)).map((a) => chrome.alarms.clear(a.name)));
  if (!settings.remindersEnabled) return;
  const now = Date.now(), horizon = now + 7 * 86400000;
  (uca_events || []).forEach((ev) => {
    const start = eventStart(ev), when = start - settings.reminderMinutes * 60000;
    if (when > now + 5000 && start < horizon) chrome.alarms.create(REMINDER_PREFIX + eventKey(ev), { when });
  });
}

async function onReminderAlarm(name) {
  const key = name.slice(REMINDER_PREFIX.length);
  const [{ uca_events }, design] = await Promise.all([chrome.storage.local.get("uca_events"), currentDesign()]);
  const ev = (uca_events || []).find((e) => eventKey(e) === key);
  if (!ev) return;
  const minutes = Math.max(1, Math.round((eventStart(ev) - Date.now()) / 60000));
  notify(name, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(`${design ? design.folder + "/icons" : "icons"}/icon128.png`),
    title: `Dans ${minutes} min : ${ev.title}`,
    message: [ev.room && "Salle " + ev.room, ev.teacher].filter(Boolean).join(" · ") || `${pad(ev.startH)}:${pad(ev.startM)} – ${pad(ev.endH)}:${pad(ev.endM)}`,
    priority: 1,
  });
}

if (typeof chrome.notifications !== "undefined" && chrome.notifications.onClicked) chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith("uca_")) return;
  const design = await currentDesign();
  chrome.tabs.create({ url: chrome.runtime.getURL(design ? `${design.folder}/agenda.html` : "choose.html?tab=1") });
  chrome.notifications.clear(id);
});

async function configureAutoSync() {
  const { autoSyncHours } = await UCA_getSettings();
  await chrome.alarms.clear(AUTO_SYNC_ALARM);
  if (autoSyncHours > 0) chrome.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: autoSyncHours * 60 });
}

async function runBackgroundSync() {
  const { uca_last_sync } = await chrome.storage.local.get("uca_last_sync");
  if (!uca_last_sync || syncInProgress) return; // jamais connecté : rien à resynchroniser
  syncInProgress = true;
  try { await handleSync("background"); } catch (e) { /* réessai à la prochaine alarme */ } finally { syncInProgress = false; }
}

/* « 25m » si un cours commence dans moins d'une heure, sinon l'heure du prochain cours du
   jour (« 14h ») ; « ! » si la session a expiré. Le détail est dans l'infobulle. */
async function updateBadge() {
  const [settings, data, design] = await Promise.all([UCA_getSettings(), chrome.storage.local.get(["uca_events", "uca_session_expired", "uca_last_sync"]), currentDesign()]);
  const color = (design && design.badgeColor) || "#5f6368";
  let text = "", title = "Emploi du temps UCA";
  if (data.uca_session_expired && data.uca_last_sync) { text = "!"; title = "Session Odin expirée : reconnecte-toi"; }
  else if (settings.badgeMode !== "off") {
    const now = Date.now(), today = new Date();
    const key = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEvs = (data.uca_events || []).filter((e) => e.date === key).sort((a, b) => eventStart(a) - eventStart(b));
    if (settings.badgeMode === "remaining") {
      const left = todayEvs.filter((e) => eventEnd(e) > now);
      if (left.length) { text = String(left.length); title = `${left.length} cours restant${left.length > 1 ? "s" : ""} aujourd'hui`; }
    } else {
      const next = todayEvs.find((e) => eventStart(e) > now);
      if (next) {
        const mins = Math.round((eventStart(next) - now) / 60000);
        text = mins < 60 ? `${mins}m` : `${next.startH}h`;
        title = `Prochain cours : ${pad(next.startH)}:${pad(next.startM)} ${next.title}${next.room ? " — " + next.room : ""}`;
      }
    }
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: text === "!" ? "#d93025" : color });
  await chrome.action.setTitle({ title });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(REMINDER_PREFIX)) onReminderAlarm(alarm.name);
  else if (alarm.name === AUTO_SYNC_ALARM) runBackgroundSync();
  else if (alarm.name === BADGE_ALARM) updateBadge();
  else if (alarm.name === STATUS_ALARM) runStatusWatch();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.uca_events || changes.uca_settings) scheduleReminders();
  if (changes.uca_settings) { configureAutoSync(); configureStatusWatch(); }
  if (changes.uca_events || changes.uca_settings || changes.uca_session_expired || changes.uca_design) updateBadge();
});
chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 1 });

/* Surveillance du statut (réglage statusWatch) : Odin et la connexion toutes les 5 min,
   notification seulement quand l'état passe de en ligne à en panne, ou l'inverse. */
const STATUS_ALARM = "uca_status";
async function configureStatusWatch() {
  const { statusWatch } = await UCA_getSettings();
  await chrome.alarms.clear(STATUS_ALARM);
  if (statusWatch) chrome.alarms.create(STATUS_ALARM, { periodInMinutes: 5 });
}
async function runStatusWatch() {
  if (!(await UCA_getSettings()).statusWatch) return;
  const ids = UCA_STATUS.SITES.filter((s) => s.watch).map((s) => s.id);
  const { previous, current } = await UCA_STATUS.checkAll(ids);
  const design = await currentDesign();
  ids.forEach((id) => {
    const before = previous[id] && previous[id].state, now = current[id].state;
    if (!before || (before === "down") === (now === "down")) return;
    const label = UCA_STATUS.SITES.find((s) => s.id === id).label;
    notify("uca_status|" + id + "|" + Date.now(), {
      type: "basic",
      iconUrl: chrome.runtime.getURL(`${design ? design.folder + "/icons" : "icons"}/icon128.png`),
      title: now === "down" ? `${label} est en panne` : `${label} est de nouveau disponible`,
      message: now === "down" ? current[id].reason || "Le service ne répond pas." : "Tu peux relancer ta synchronisation.",
      priority: 1,
    });
  });
}
chrome.runtime.onStartup.addListener(() => { scheduleReminders(); configureAutoSync(); configureStatusWatch(); updateBadge(); });
chrome.runtime.onInstalled.addListener(() => { scheduleReminders(); configureAutoSync(); configureStatusWatch(); updateBadge(); });

/* ============ Changements d'emploi du temps ============
   Comparaison sur la plage de dates couverte par les deux synchros et à partir
   d'aujourd'hui (un cours passé sorti de la fenêtre Odin n'est pas une annulation).
   Appariement ancien → nouveau, du plus sûr au moins sûr :
     1. même jour + même début + même intitulé : compare fin, salle, enseignant, infos ;
     2. même intitulé, même jour, autre heure : déplacé ;
     3. même jour + même créneau, autre intitulé : intitulé modifié (TD → TP, autre matière...) ;
     4. même intitulé, autre jour (≤ 7 jours d'écart, le plus proche) : déplacé à un autre jour ;
     5. le reste : ajouté / annulé.
   Chaque changement garde `details` (« Salle : B102 → B205 »...), affichés dans l'agenda et la
   notification. Gardés 7 jours dans uca_edt_changes. */
const EDT_CHANGE_TTL_MS = 7 * 86400000;
const CHANGE_LABELS_BG = { added: "Ajouté", moved: "Déplacé", room: "Salle changée", teacher: "Enseignant changé", time: "Horaire modifié", title: "Intitulé modifié", info: "Infos modifiées", cancelled: "Annulé" };

function fmtRange(e) { return `${pad(e.startH)}:${pad(e.startM)}–${pad(e.endH)}:${pad(e.endM)}`; }
function fmtDayShort(e) { return new Date(e.year, e.month, e.day).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); }
function dayGap(a, b) { return Math.abs(Date.UTC(a.year, a.month, a.day) - Date.UTC(b.year, b.month, b.day)) / 86400000; }
function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
// Texte brut d'Odin sans l'intitulé, l'enseignant ni la salle : ce qui reste (groupe, remarque,
// « annulé », « reporté »...) — un changement là-dedans est signalé comme « infos modifiées ».
function extraInfo(e) {
  let r = norm(e.raw);
  [e.title, e.teacher, e.room].forEach((part) => { if (part) r = r.split(norm(part)).join(" "); });
  return norm(r.replace(/enseignants?\s*:|salle\s*:/gi, " "));
}
function eventSnapshot(e) { return { date: e.date, year: e.year, month: e.month, day: e.day, startH: e.startH, startM: e.startM, endH: e.endH, endM: e.endM, title: e.title, room: e.room, teacher: e.teacher }; }

function compareEvents(o, e) {
  const details = [], kinds = new Set();
  if (o.date !== e.date) { kinds.add("moved"); details.push(`Jour : ${fmtDayShort(o)} → ${fmtDayShort(e)}`); }
  if (o.startH !== e.startH || o.startM !== e.startM) { kinds.add("moved"); details.push(`Horaire : ${fmtRange(o)} → ${fmtRange(e)}`); }
  else if (o.endH !== e.endH || o.endM !== e.endM) { kinds.add("time"); details.push(`Horaire : ${fmtRange(o)} → ${fmtRange(e)}`); }
  if (norm(o.title) !== norm(e.title)) { kinds.add("title"); details.push(`Intitulé : ${o.title} → ${e.title}`); }
  if (norm(o.room) !== norm(e.room)) { kinds.add("room"); details.push(`Salle : ${o.room || "—"} → ${e.room || "—"}`); }
  if (norm(o.teacher) !== norm(e.teacher)) { kinds.add("teacher"); details.push(`Enseignant : ${o.teacher || "—"} → ${e.teacher || "—"}`); }
  if (o.raw !== undefined && e.raw !== undefined && extraInfo(o) !== extraInfo(e) && (extraInfo(o) || extraInfo(e))) {
    kinds.add("info"); details.push(`Infos : ${extraInfo(o) || "—"} → ${extraInfo(e) || "—"}`);
  }
  if (!kinds.size) return null;
  // Badge principal : ce qui compte le plus pour l'étudiant (où et quand aller).
  const type = ["moved", "room", "time", "title", "teacher", "info"].find((k) => kinds.has(k));
  return { type, kinds: [...kinds], details, before: eventSnapshot(o) };
}

function diffEvents(prev, next) {
  if (!prev.length || !next.length) return [];
  const t = new Date();
  const today = dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  const span = (evs) => evs.reduce((r, e) => [e.date < r[0] ? e.date : r[0], e.date > r[1] ? e.date : r[1]], [evs[0].date, evs[0].date]);
  const [p0, p1] = span(prev), [n0, n1] = span(next);
  const lo = [p0, n0, today].sort()[2], hi = [p1, n1].sort()[0];
  if (lo > hi) return [];
  const inRange = (e) => e.date >= lo && e.date <= hi;
  const P = prev.filter(inRange), N = next.filter(inRange);
  const usedP = new Set(), usedN = new Set(), out = [];
  const pair = (test, score) => {
    N.forEach((e, ni) => {
      if (usedN.has(ni)) return;
      let best = -1, bestScore = Infinity;
      P.forEach((o, pi) => {
        if (usedP.has(pi) || !test(o, e)) return;
        const s = score ? score(o, e) : 0;
        if (s < bestScore) { best = pi; bestScore = s; }
      });
      if (best < 0) return;
      usedP.add(best); usedN.add(ni);
      const c = compareEvents(P[best], e);
      if (c) out.push({ ...c, key: eventKey(e), ev: e });
    });
  };
  const startMin = (e) => e.startH * 60 + e.startM;
  pair((o, e) => o.date === e.date && startMin(o) === startMin(e) && norm(o.title) === norm(e.title));
  pair((o, e) => o.date === e.date && norm(o.title) === norm(e.title), (o, e) => Math.abs(startMin(o) - startMin(e)));
  pair((o, e) => o.date === e.date && startMin(o) === startMin(e) && o.endH === e.endH && o.endM === e.endM);
  pair((o, e) => norm(o.title) === norm(e.title) && dayGap(o, e) <= 7, (o, e) => dayGap(o, e) * 1440 + Math.abs(startMin(o) - startMin(e)));
  N.forEach((e, ni) => { if (!usedN.has(ni)) out.push({ type: "added", key: eventKey(e), ev: e, details: [`${fmtDayShort(e)} ${fmtRange(e)}${e.room ? ", salle " + e.room : ""}`] }); });
  P.forEach((o, pi) => { if (!usedP.has(pi)) out.push({ type: "cancelled", key: eventKey(o), ev: o, details: [`${fmtDayShort(o)} ${fmtRange(o)}${o.room ? ", salle " + o.room : ""}`] }); });
  return out;
}

async function applyEdtChanges(prev, next) {
  const found = diffEvents(prev, next);
  const now = Date.now();
  const { uca_edt_changes } = await chrome.storage.local.get("uca_edt_changes");
  const nextKeys = new Set(next.map(eventKey));
  const fresh = new Set(found.map((c) => c.key));
  const kept = (uca_edt_changes || []).filter((c) => now - c.at < EDT_CHANGE_TTL_MS && !fresh.has(c.key)
    && (c.type === "cancelled" ? !nextKeys.has(c.key) : nextKeys.has(c.key)));
  const all = kept.concat(found.map((c) => ({ ...c, at: now })));
  await chrome.storage.local.set({ uca_edt_changes: all });
  if (found.length) await notifyEdtChanges(found);
  return found;
}

function fmtEvShort(ev) {
  const d = new Date(ev.year, ev.month, ev.day);
  return `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${pad(ev.startH)}:${pad(ev.startM)}`;
}

async function notifyEdtChanges(list) {
  const settings = await UCA_getSettings();
  if (!settings.notifyEdtChanges) return;
  const design = await currentDesign();
  const lines = list.slice(0, 4).map((c) => `${CHANGE_LABELS_BG[c.type]} : ${c.ev.title} (${fmtEvShort(c.ev)})${c.details && c.details.length && c.type !== "added" && c.type !== "cancelled" ? " — " + c.details.join(" ; ") : ""}`);
  if (list.length > 4) lines.push(`… et ${list.length - 4} autre(s)`);
  notify("uca_edt|" + Date.now(), {
    type: "basic",
    iconUrl: chrome.runtime.getURL(`${design ? design.folder + "/icons" : "icons"}/icon128.png`),
    title: list.length === 1 ? "Emploi du temps modifié" : `${list.length} changements d'emploi du temps`,
    message: lines.join("\n"),
    priority: 1,
  });
}

async function notifyNewGrades(list) {
  const settings = await UCA_getSettings();
  if (!settings.notifyNewGrades) return;
  const design = await currentDesign();
  const fmt = (n) => String(n).replace(".", ",");
  notify("uca_grade|" + Date.now(), {
    type: "basic",
    iconUrl: chrome.runtime.getURL(`${design ? design.folder + "/icons" : "icons"}/icon128.png`),
    title: list.length === 1 ? `Nouvelle note : ${fmt(list[0].note)}` : `${list.length} nouvelles notes`,
    message: list.slice(0, 4).map((g) => `${g.label} : ${fmt(g.note)}`).join("\n"),
    priority: 1,
  });
}
