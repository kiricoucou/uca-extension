(function () {
"use strict";

/* Chaque réglage : clé de UCA_SETTINGS_DEFAULTS, type "select" (options [valeur, libellé])
   ou "switch". Ajouter un réglage = ajouter une ligne ici + sa valeur par défaut. */
const SECTIONS = [
  { title: "Affichage", fields: [
    { key: "startView", type: "select", label: "Vue à l'ouverture", hint: "« Automatique » : Semaine sur ordinateur (5 jours si rien aujourd'hui), Jour sur téléphone.",
      options: [["auto", "Automatique"], ["day", "Jour"], ["3day", "3 jours"], ["5day", "5 jours"], ["6day", "6 jours"], ["week", "Semaine"], ["month", "Mois"]] },
    { key: "hideWeekend", type: "switch", label: "Masquer le week-end", hint: "Vue Semaine : samedi et dimanche n'apparaissent que s'il y a cours." },
    { key: "noteNewDays", type: "select", label: "Nouvelles notes en orange", hint: "Une note nouvelle (ou modifiée) reste orange pendant ce délai, puis jaune pendant le même délai.",
      options: [[1, "1 jour"], [2, "2 jours"], [3, "3 jours"], [5, "5 jours"], [7, "7 jours"]] },
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
    { ext: true, key: "notifyNewGrades", type: "switch", label: "Nouvelle note", hint: "Notification quand une note apparaît (ou change) dans ton relevé." },
  ] },
];

// Réinitialiser l'agenda : vide les données synchronisées (cours, notes perso, absences, relevé,
// changements d'EDT), jamais les réglages ni le design. Une sauvegarde est gardée 10 min pour
// pouvoir annuler (uca_reset_backup, hors uca_settings : jamais exportée ni dans un lien de partage).
const RESET_KEYS = ["uca_events", "uca_last_sync", "uca_notes", "uca_absences", "uca_absences_sync",
  "uca_releve_notes", "uca_releve_notes_sync", "uca_notes_seen", "uca_edt_changes", "uca_app_imported_at", "uca_app_exported_at"];
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
      row.append(txt, control(f, settings[f.key]));
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

UCA_getSettings().then(render);
})();
