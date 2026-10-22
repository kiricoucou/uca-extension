(function () {
"use strict";

/* Chaque réglage : clé de UCA_SETTINGS_DEFAULTS, type "select" (options [valeur, libellé])
   ou "switch". Ajouter un réglage = ajouter une ligne ici + sa valeur par défaut. */
const SECTIONS = [
  { title: "Affichage", fields: [
    { key: "startView", type: "select", label: "Vue à l'ouverture", hint: "« Automatique » : Semaine sur ordinateur (5 jours si rien aujourd'hui), Jour sur téléphone.",
      options: [["auto", "Automatique"], ["day", "Jour"], ["3day", "3 jours"], ["5day", "5 jours"], ["6day", "6 jours"], ["week", "Semaine"], ["month", "Mois"]] },
    { key: "hideWeekend", type: "switch", label: "Masquer le week-end", hint: "Vue Semaine : samedi et dimanche n'apparaissent que s'il y a cours." },
    { key: "compactCards", type: "switch", label: "Blocs de cours compacts", hint: "Masque le nom de l'enseignant dans les blocs de l'agenda (il reste dans le détail du cours)." },
    { key: "noteNewDays", type: "select", label: "Nouvelles notes en orange", hint: "Une note nouvelle (ou modifiée) reste orange pendant ce délai, puis jaune pendant le même délai.",
      options: [[1, "1 jour"], [2, "2 jours"], [3, "3 jours"], [5, "5 jours"], [7, "7 jours"]] },
  ] },
  { title: "Design automatique", fields: [
    { key: "autoDesign", type: "switch", label: "Suivre le thème clair/sombre du système", hint: "Le design change tout seul quand ton ordinateur ou ton téléphone passe du clair au sombre. Quand c'est activé, il remplace le design choisi à la main." },
    { key: "designLight", type: "select", label: "Design en thème clair", optionsFrom: "designs", options: [] },
    { key: "designDark", type: "select", label: "Design en thème sombre", optionsFrom: "designs", options: [] },
  ] },
  { title: "Partage vers le téléphone", fields: [
    { ext: true, key: "shareLinkHours", type: "select", label: "Durée de validité d'un lien",
      hint: "Passé ce délai, l'app refuse le lien. Rien n'est stocké sur GitHub ni sur un serveur : les données voyagent chiffrées dans le lien lui-même.",
      options: [[1, "1 heure"], [6, "6 heures"], [24, "1 jour"], [48, "2 jours"], [168, "7 jours"]] },
    { ext: true, key: "shareCode", type: "code", label: "Code de partage",
      hint: "Chiffre tes liens : sans ce code, un lien est illisible. À taper une seule fois sur le téléphone. Changer le code rend les anciens liens inutilisables." },
  ] },
  { title: "Rappels et synchronisation", fields: [
    { ext: true, key: "remindersEnabled", type: "switch", label: "Rappel avant chaque cours", hint: "Notification avec la matière et la salle." },
    { key: "reminderMinutes", type: "select", label: "Délai du rappel",
      options: [[5, "5 min avant"], [10, "10 min avant"], [15, "15 min avant"], [30, "30 min avant"], [60, "1 h avant"]] },
    { ext: true, key: "autoSyncHours", type: "select", label: "Synchronisation automatique",
      hint: "En arrière-plan, tant que ta session Odin est valide. Si elle a expiré, rien ne s'ouvre : l'icône affiche « ! » et tu te reconnectes quand tu veux.",
      options: [[0, "Désactivée"], [1, "Toutes les heures"], [3, "Toutes les 3 h"], [6, "Toutes les 6 h"], [12, "Toutes les 12 h"]] },
    { ext: true, key: "badgeMode", type: "select", label: "Pastille sur l'icône",
      hint: "« 25m » quand un cours commence dans moins d'une heure, sinon l'heure (« 14h »).",
      options: [["next", "Prochain cours du jour"], ["remaining", "Cours restants aujourd'hui"], ["off", "Aucune"]] },
  ] },
  { title: "Alertes", fields: [
    { ext: true, key: "notifyEdtChanges", type: "switch", label: "Changement d'emploi du temps", hint: "Cours ajouté, annulé, déplacé ou changement de salle, détecté à chaque synchro. Les cours concernés sont aussi marqués dans l'agenda pendant 7 jours." },
    { ext: true, key: "statusWatch", type: "switch", label: "Surveiller Odin en arrière-plan", hint: "Teste Odin et la connexion toutes les 5 minutes et te prévient quand ils tombent en panne, puis quand ils reviennent." },
    { key: "absenceAlert", type: "select", label: "Alerte d'absences non justifiées", hint: "Quand ce nombre est atteint : message dans le panneau Absences et notification. Désactivée par défaut.",
      options: [[0, "Désactivée"], [2, "À 2 absences"], [3, "À 3 absences"], [4, "À 4 absences"], [5, "À 5 absences"], [6, "À 6 absences"], [8, "À 8 absences"], [10, "À 10 absences"]] },
    { ext: true, key: "notifyNewGrades", type: "switch", label: "Nouvelle note", hint: "Notification quand une note apparaît (ou change) dans ton relevé." },
  ] },
];

// Réinitialiser l'agenda : vide les données synchronisées (cours, notes perso, absences, relevé,
// changements d'EDT), jamais les réglages ni le design. Une sauvegarde est gardée 10 min pour
// pouvoir annuler (uca_reset_backup, hors uca_settings : jamais exportée ni dans un lien de partage).
const RESET_KEYS = ["uca_events", "uca_last_sync", "uca_notes", "uca_absences", "uca_absences_sync",
  "uca_releve_notes", "uca_releve_notes_sync", "uca_notes_seen", "uca_notes_history", "uca_absence_alert", "uca_edt_changes", "uca_app_imported_at", "uca_app_exported_at"];
const UNDO_WINDOW_MS = 10 * 60 * 1000;

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

/* Paramètres suit le design déjà choisi (extension et app) : couleurs reprises de
   designs.json (préparées pour les pages app/app.css, voir core/env.js, réutilisées ici
   avec les noms de variables de settings.html). */
chrome.storage.local.get("uca_design", ({ uca_design }) => {
  if (!uca_design) return;
  fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()).then((designs) => {
    const p = (designs.find((d) => d.id === uca_design) || {}).preview;
    if (!p) return;
    const root = document.documentElement.style;
    [["--bg", "background"], ["--surface", "surface"], ["--border", "border"], ["--text", "text"],
      ["--text-dim", "textDim"], ["--focus", "accent"], ["--on-focus", "onAccent"]].forEach(([cssVar, key]) => {
      if (p[key]) root.setProperty(cssVar, p[key]);
    });
  }).catch(() => {});
});

let savedTimer = 0;
function flashSaved() {
  $("saved").classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
}
function save(key, value) { UCA_saveSettings({ [key]: value }).then(flashSaved); }

/* Code de partage : hors uca_settings (jamais inclus dans un export/lien), voir core/transfer.js. */
function codeControl() {
  const wrap = el("div", "code-ctl");
  const input = el("input"); input.type = "text"; input.id = "f-shareCode"; input.maxLength = 16;
  input.autocomplete = "off"; input.spellcheck = false;
  const regen = el("button", "upd-btn", "Nouveau"); regen.type = "button"; regen.id = "shareCodeNew";
  const store = (code) => chrome.storage.local.set({ uca_share_code: code }).then(flashSaved);
  UCA_TRANSFER.shareDetails().then(({ code }) => { input.value = code; });
  input.addEventListener("change", () => {
    const code = UCA_TRANSFER.normCode(input.value);
    if (code.length < 4) { input.setCustomValidity("4 caractères minimum"); input.reportValidity(); return; }
    input.setCustomValidity(""); input.value = code; store(code);
  });
  regen.addEventListener("click", () => { const code = UCA_TRANSFER.randomCode(); input.value = code; store(code); });
  wrap.append(input, regen);
  return wrap;
}

function control(field, value) {
  if (field.type === "code") return codeControl();
  if (field.type === "switch") {
    const wrap = el("label", "switch");
    const input = el("input"); input.type = "checkbox"; input.checked = !!value; input.id = "f-" + field.key;
    input.addEventListener("change", () => save(field.key, input.checked));
    wrap.append(input, el("span"));
    return wrap;
  }
  const select = el("select"); select.id = "f-" + field.key;
  field.options.forEach(([v, l]) => { const o = el("option", "", l); o.value = String(v); select.appendChild(o); });
  select.value = String(value);
  select.addEventListener("change", () => {
    const raw = select.value;
    save(field.key, typeof UCA_SETTINGS_DEFAULTS[field.key] === "number" ? Number(raw) : raw);
  });
  return select;
}

let DESIGN_OPTIONS = [];
function render(settings) {
  const root = $("sections"); root.innerHTML = "";
  SECTIONS.forEach((sec) => {
    const fields = sec.fields.filter((f) => !(window.UCA_APP && f.ext));
    if (!fields.length) return;
    const s = el("section"); s.appendChild(el("h2", "", sec.title));
    fields.forEach((f) => {
      const row = el("div", "row");
      const txt = el("div", "txt");
      const lbl = el("label", "lbl", f.label); lbl.htmlFor = "f-" + f.key;
      txt.appendChild(lbl);
      if (f.hint) txt.appendChild(el("div", "hint", f.hint));
      const ctl = f.optionsFrom === "designs" ? control(Object.assign({}, f, { options: DESIGN_OPTIONS }), settings[f.key]) : control(f, settings[f.key]);
      row.append(txt, ctl);
      s.appendChild(row);
    });
    root.appendChild(s);
  });
}

$("backBtn").addEventListener("click", () => {
  // App : Paramètres remplace la page dans le même onglet (core/env.js) -> un vrai retour existe.
  // Extension : Paramètres s'ouvre dans un onglet dédié (chrome.tabs.create) -> rien à quoi
  // revenir, on ferme cet onglet à la place.
  if (history.length > 1) history.back();
  else window.close();
});

$("resetBtn").addEventListener("click", () => {
  chrome.storage.local.set({ uca_settings: Object.assign({}, UCA_SETTINGS_DEFAULTS) }).then(() => { render(UCA_SETTINGS_DEFAULTS); flashSaved(); });
});

/* Double clic (confirmation) : 1er clic arme le bouton pendant quelques secondes, 2e clic agit. */
let wipeArmed = 0;
const WIPE_LABEL = "Réinitialiser l'agenda";
function setWipeArmed(on) {
  clearTimeout(wipeArmed);
  const b = $("wipeBtn");
  if (on) {
    b.textContent = "Confirmer : tout sera supprimé"; b.classList.add("armed");
    wipeArmed = setTimeout(() => setWipeArmed(false), 4000);
  } else { b.textContent = WIPE_LABEL; b.classList.remove("armed"); }
}
$("wipeBtn").addEventListener("click", () => {
  if (!$("wipeBtn").classList.contains("armed")) { setWipeArmed(true); return; }
  setWipeArmed(false);
  chrome.storage.local.get(RESET_KEYS).then((backup) => chrome.storage.local.set({ uca_reset_backup: { at: Date.now(), data: backup } })
    .then(() => chrome.storage.local.remove(RESET_KEYS))).then(renderUndoBanner);
});
document.addEventListener("click", (e) => { if (!e.target.closest("#wipeBtn") && $("wipeBtn").classList.contains("armed")) setWipeArmed(false); });

let undoTimer = 0;
function renderUndoBanner() {
  chrome.storage.local.get("uca_reset_backup").then(({ uca_reset_backup: backup }) => {
    let bar = $("undoBar");
    clearTimeout(undoTimer);
    const left = backup ? backup.at + UNDO_WINDOW_MS - Date.now() : 0;
    if (!backup || left <= 0) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = el("div", "undo-bar"); bar.id = "undoBar";
      const txt = el("span", "", "Agenda réinitialisé.");
      const btn = el("button", "upd-btn primary", "Annuler"); btn.type = "button";
      btn.addEventListener("click", () => chrome.storage.local.set(backup.data).then(() => chrome.storage.local.remove("uca_reset_backup")).then(() => { flashSaved(); renderUndoBanner(); }));
      bar.append(txt, btn);
      document.body.appendChild(bar);
    }
    undoTimer = setTimeout(renderUndoBanner, Math.min(left, 60000));
  });
}
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.uca_reset_backup) renderUndoBanner(); });
renderUndoBanner();
$("agendaBtn").addEventListener("click", () => {
  Promise.all([fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()), chrome.storage.local.get("uca_design")])
    .then(([designs, d]) => {
      const design = designs.find((x) => x.id === d.uca_design);
      location.href = chrome.runtime.getURL(design ? `${design.folder}/agenda.html` : "choose.html?tab=1");
    });
});

/* Mises à jour : même mécanisme que le bandeau de l'agenda (background.js pour l'extension,
   core/env.js pour l'app). Version périmée : la page est bloquée, seul "Mettre à jour" reste. */
function renderUpdate(d) {
  $("verCur").textContent = d.uca_current_version || "—";
  $("verLat").textContent = d.uca_latest_version || "—";
  $("updErr").textContent = d.uca_update_check_failed ? "Vérification impossible (pas de connexion, ou github.com injoignable)." : "";
  let block = $("updBlock");
  if (!d.uca_update_available) { if (block) block.remove(); return; }
  if (block) return;
  block = el("div", "upd-block"); block.id = "updBlock";
  const box = el("div", "box");
  box.append(el("h2", "", "Nouvelle version disponible"),
    el("p", "hint", `Installée : ${d.uca_current_version || "?"} · Dernière : ${d.uca_latest_version || "?"}`));
  const b = el("button", "upd-btn primary", "Mettre à jour"); b.type = "button";
  b.addEventListener("click", () => { b.disabled = true; chrome.runtime.sendMessage({ type: "UCA_APPLY_UPDATE" }); });
  box.appendChild(b); block.appendChild(box); document.body.appendChild(block);
}
const UPD_KEYS = ["uca_update_available", "uca_current_version", "uca_latest_version", "uca_update_check_failed"];
chrome.storage.local.get(UPD_KEYS).then(renderUpdate);
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && UPD_KEYS.some((k) => c[k])) chrome.storage.local.get(UPD_KEYS).then(renderUpdate); });
const CHECK_BTN_LABEL = "Vérifier les mises à jour";
$("checkUpdBtn").addEventListener("click", () => {
  const b = $("checkUpdBtn"); b.disabled = true; b.textContent = "Vérification…";
  chrome.runtime.sendMessage({ type: "UCA_FORCE_UPDATE_CHECK" });
  // Jusqu'à 2 essais côté background.js/env.js (environ 1,2 s entre les deux) : on laisse la marge.
  setTimeout(() => chrome.storage.local.get(UPD_KEYS).then((d) => {
    renderUpdate(d);
    // Mise à jour disponible : le bloc plein écran (un seul bouton "Mettre à jour") prend le
    // relais, pas la peine de réactiver celui-ci dessous.
    if (d.uca_update_available) return;
    b.disabled = false;
    b.textContent = d.uca_update_check_failed ? "Réessayer" : "À jour ✓";
    setTimeout(() => { if (!$("updBlock")) b.textContent = CHECK_BTN_LABEL; }, 2500);
  }), 4000);
});
chrome.runtime.sendMessage({ type: "UCA_FORCE_UPDATE_CHECK" });

/* Journal de diagnostic (uca_diag_log, écrit par background.js) : copie en texte brut. */
function diagText(log, issues) {
  const head = `Emploi du temps UCA ${(chrome.runtime.getManifest && chrome.runtime.getManifest().version) || ""} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 90)}`;
  const lines = (log || []).map((l) => `${new Date(l.at).toLocaleString("fr-FR")}  ${l.event}  ${l.detail}`.trimEnd());
  const iss = Object.keys(issues || {}).map((k) => `problème en cours : ${k} = ${issues[k].issue}`);
  return [head, ...iss, ...lines].join("\n");
}
function renderDiag() {
  chrome.storage.local.get(["uca_diag_log", "uca_scrape_issues"]).then(({ uca_diag_log: log, uca_scrape_issues: issues }) => {
    const n = (log || []).length, last = n ? log[n - 1] : null;
    $("diagState").textContent = n ? `${n} événement${n > 1 ? "s" : ""} · dernier : ${last.event} (${new Date(last.at).toLocaleString("fr-FR")})` : "Aucun événement.";
    $("diagCopyBtn").disabled = !n && !Object.keys(issues || {}).length;
    $("diagClearBtn").disabled = !n;
  });
}
$("diagCopyBtn").addEventListener("click", () => {
  chrome.storage.local.get(["uca_diag_log", "uca_scrape_issues"]).then((d) => {
    const text = diagText(d.uca_diag_log, d.uca_scrape_issues), b = $("diagCopyBtn");
    const done = () => { b.textContent = "Copié ✓"; setTimeout(() => { b.textContent = "Copier"; }, 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* copie impossible : le journal reste lisible dans le stockage */ }
      ta.remove();
    });
  });
});
$("diagClearBtn").addEventListener("click", () => chrome.storage.local.remove("uca_diag_log").then(renderDiag));
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && (c.uca_diag_log || c.uca_scrape_issues)) renderDiag(); });
renderDiag();

/* Statut des sites : sonde au chargement puis toutes les 30 s tant que la page est visible ;
   le service worker (surveillance) écrit aussi dans uca_status, d'où l'écoute du stockage. */
const ST_LABEL = { ok: "En ligne", slow: "Lent", down: "En panne", unknown: "Inconnu" };
function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 5 ? "à l'instant" : s < 60 ? `il y a ${s} s` : `il y a ${Math.round(s / 60)} min`;
}
function sparkline(history) {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "st-spark"); svg.setAttribute("viewBox", "0 0 84 22"); svg.setAttribute("aria-hidden", "true");
  const max = Math.max(1000, ...history.map((h) => h.ms));
  history.forEach((h, i) => {
    const r = document.createElementNS(NS, "rect"), down = h.state === "down";
    const ht = down ? 22 : Math.max(3, Math.round(22 * Math.min(h.ms, max) / max));
    r.setAttribute("x", i * 4.2); r.setAttribute("width", 3); r.setAttribute("y", 22 - ht); r.setAttribute("height", ht);
    if (down) r.setAttribute("class", "down");
    svg.appendChild(r);
  });
  return svg;
}
function renderStatus(data) {
  const sites = (data && data.sites) || {};
  const rows = $("stRows"); rows.innerHTML = "";
  const down = []; let measured = 0;
  UCA_STATUS.SITES.forEach((site) => {
    const r = sites[site.id], state = r ? r.state : "unknown";
    if (r) measured++;
    if (state === "down") down.push(site.label);
    const row = el("div", "st-row"); row.dataset.state = state; row.id = "st-" + site.id;
    const txt = el("div", "txt");
    txt.appendChild(el("div", "lbl", site.label));
    const detail = r
      ? (state === "down" ? r.reason : `${r.ms} ms${r.exact ? "" : " · joignable (état exact non lisible)"}`) + " · " + ago(r.at)
      : site.host;
    txt.appendChild(el("div", "hint", detail));
    row.append(el("span", "st-dot"), txt);
    if (r && r.history && r.history.length > 1) row.appendChild(sparkline(r.history));
    row.appendChild(el("span", "st-state", ST_LABEL[state]));
    rows.appendChild(row);
  });
  const sum = $("stSummary");
  sum.className = "st-sum" + (down.length ? " bad" : measured ? " ok" : "");
  sum.textContent = !measured ? "Test en cours…" : down.length ? `En panne : ${down.join(", ")}` : "Tout fonctionne";
}
let stBusy = false;
async function runStatus() {
  if (stBusy) return;
  stBusy = true;
  const b = $("stTestBtn"); b.disabled = true; b.textContent = "Test en cours…";
  try { await UCA_STATUS.checkAll(); } catch (e) { /* l'affichage garde le dernier état */ }
  stBusy = false; b.disabled = false; b.textContent = "Tester maintenant";
}
$("stTestBtn").addEventListener("click", runStatus);
chrome.storage.local.get("uca_status").then(({ uca_status }) => renderStatus(uca_status));
chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.uca_status) renderStatus(c.uca_status.newValue); });
setInterval(() => { if (!document.hidden) runStatus(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) runStatus(); });
runStatus();

fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()).then((designs) => { DESIGN_OPTIONS = designs.map((d) => [d.id, d.name || d.id]); }).catch(() => {})
  .then(() => UCA_getSettings()).then(render);
})();
