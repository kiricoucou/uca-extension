/* Réglages communs à tous les designs, partagés par les pages et le service worker
   (stockés dans chrome.storage.local.uca_settings ; toute clé absente prend sa valeur par défaut). */
(function (root) {
"use strict";

const DEFAULTS = {
  startView: "auto",   // auto | list | day | 3day | 5day | 6day | week | month
  hideWeekend: false,  // vue Semaine : samedi/dimanche masqués s'il n'y a pas cours
  remindersEnabled: true,
  reminderMinutes: 15, // notification N minutes avant chaque cours
  autoSyncHours: 3,    // 0 = désactivée ; synchro silencieuse uniquement (jamais de fenêtre CAS)
  badgeMode: "next",   // next (prochain cours du jour) | remaining (cours restants aujourd'hui) | off
  notifyEdtChanges: true, // notification quand un cours est ajouté / annulé / déplacé / change de salle
  notifyNewGrades: true,  // notification quand une nouvelle note apparaît
  shareLinkHours: 48,     // durée de validité d'un lien de partage chiffré (core/transfer.js)
  compactCards: false,    // blocs de cours sans le nom de l'enseignant (visible dans le détail)
  autoDesign: false,      // le design suit le thème clair/sombre du système
  designLight: "studio",
  designDark: "anime",
  pinNext: false,         // app seulement : notification « prochain cours » épinglée (mise à jour à l'ouverture)
  taskReminders: true,    // notification la veille à 18 h pour chaque devoir à rendre et chaque examen
  absenceAlert: 0,        // 0 = désactivée ; sinon alerte à N absences non justifiées
  statusWatch: false,     // surveille Odin et la connexion toutes les 5 min, notifie panne / retour
  activityKeepDays: 30,   // jours de conservation des notifications non gardées de la cloche (0 = illimité)
  moodleNotes: true,      // cherche les nouvelles notes sur Moodle, activé par défaut (validation par l'utilisateur avant d'entrer dans les moyennes)
  noteNewDays: 2,         // note affichée en orange pendant N jours, puis en jaune pendant autant
  coeffPresets: [3, 5, 10, 6], // coefficients souvent utilisés, proposés en un clic sur une note Moodle à valider
};

/* Liste de coefficients propre : nombres entre 0 et 100 (virgule acceptée), sans doublon, 8 au plus, ordre conservé. */
const COEFF_MAX_PRESETS = 8;
function coeffNumber(v) {
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}
function coeffList(value) {
  const out = [];
  (Array.isArray(value) ? value : []).forEach((v) => { const n = coeffNumber(v); if (n !== null && !out.includes(n)) out.push(n); });
  return out.slice(0, COEFF_MAX_PRESETS);
}
function coeffText(n) { return String(n).replace(".", ","); }
/* Éditeur de la liste (page Paramètres, et directement sur une note : l'application Android n'a pas la page Paramètres). */
function coeffEditor(initial, onSave) {
  const make = (tag, text, css) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (css) e.style.cssText = css; return e; };
  let list = coeffList(initial);
  const box = make("div", undefined, "display:flex;flex-direction:column;gap:8px;max-width:100%;"); box.className = "coeff-editor";
  const chips = make("div", undefined, "display:flex;flex-wrap:wrap;gap:6px;");
  const btnCss = "font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:10px;padding:5px 10px;min-height:36px;cursor:pointer;";
  const msg = make("div", "", "font-size:.85em;min-height:1.2em;"); msg.setAttribute("role", "status");
  const commit = () => { onSave(list.slice()); draw(); };
  const draw = () => {
    chips.textContent = "";
    if (!list.length) chips.appendChild(make("span", "Aucun coefficient enregistré.", "opacity:.8;"));
    list.forEach((n) => {
      const c = make("button", coeffText(n) + "  ✕", btnCss); c.type = "button"; c.className = "coeff-remove";
      c.setAttribute("aria-label", "Retirer le coefficient " + coeffText(n)); c.title = "Retirer";
      c.addEventListener("click", (e) => { e.stopPropagation(); list = list.filter((x) => x !== n); msg.textContent = ""; commit(); });
      chips.appendChild(c);
    });
  };
  const row = make("div", undefined, "display:flex;flex-wrap:wrap;gap:6px;align-items:center;");
  const input = make("input", undefined, "font:inherit;width:110px;min-height:36px;"); input.type = "text"; input.inputMode = "decimal"; input.placeholder = "ex. 3,5"; input.className = "coeff-new";
  input.setAttribute("aria-label", "Nouveau coefficient à enregistrer");
  const add = make("button", "Ajouter", btnCss + "font-weight:700;"); add.type = "button"; add.className = "coeff-add";
  const reset = make("button", "Valeurs par défaut", btnCss); reset.type = "button"; reset.className = "coeff-reset";
  const push = () => {
    const n = coeffNumber(input.value);
    if (n === null) { msg.textContent = "Écris un nombre entre 0 et 100, par exemple 3 ou 3,5."; input.focus(); return; }
    if (list.includes(n)) { msg.textContent = "Le coefficient " + coeffText(n) + " est déjà dans la liste."; return; }
    if (list.length >= COEFF_MAX_PRESETS) { msg.textContent = "Huit coefficients au maximum : retires-en un d'abord."; return; }
    list = list.concat(n); input.value = ""; msg.textContent = ""; commit(); input.focus();
  };
  add.addEventListener("click", (e) => { e.stopPropagation(); push(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); push(); } });
  input.addEventListener("click", (e) => e.stopPropagation());
  reset.addEventListener("click", (e) => { e.stopPropagation(); list = DEFAULTS.coeffPresets.slice(); msg.textContent = ""; commit(); });
  row.append(input, add, reset);
  box.append(chips, row, msg);
  draw();
  return box;
}

function getSettings() {
  return chrome.storage.local.get("uca_settings").then((d) => {
    const st = Object.assign({}, DEFAULTS, d.uca_settings);
    ["designLight", "designDark"].forEach((k) => { if (st[k] === "bulletin") st[k] = "lumen"; }); // « bulletin » est devenu « lumen »
    return st;
  });
}
function saveSettings(patch) {
  return getSettings().then((s) => chrome.storage.local.set({ uca_settings: Object.assign(s, patch) }));
}

/* Fusionne un emploi du temps tout juste synchronisé avec celui déjà enregistré : la synchro ne remplace que les cours
   d'aujourd'hui et à venir ; les jours passés sont déjà connus (anciennes synchros) et restent consultables. Un jour passé
   qu'Odin renvoie encore, mais qu'on n'avait jamais vu, est ajouté. On garde 400 jours d'historique au plus. */
const HISTORY_DAYS = 400;
function mergeSchedule(old, fresh, now) {
  const t = now ? new Date(now) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  const today = t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate());
  const limit = new Date(t.getTime() - HISTORY_DAYS * 86400000);
  const oldest = limit.getFullYear() + "-" + p(limit.getMonth() + 1) + "-" + p(limit.getDate());
  const oldPast = (Array.isArray(old) ? old : []).filter((e) => e && e.date && e.date < today && e.date >= oldest);
  const knownDays = new Set(oldPast.map((e) => e.date));
  const out = oldPast.concat((fresh || []).filter((e) => e.date < today ? (e.date >= oldest && !knownDays.has(e.date)) : true));
  return out.sort((a, b) => (a.date + p(a.startH) + p(a.startM)).localeCompare(b.date + p(b.startH) + p(b.startM)));
}

root.UCA_mergeSchedule = mergeSchedule;
root.UCA_coeffList = coeffList;
root.UCA_coeffText = coeffText;
root.UCA_coeffEditor = coeffEditor;
root.UCA_SETTINGS_DEFAULTS = DEFAULTS;
root.UCA_getSettings = getSettings;
root.UCA_saveSettings = saveSettings;
})(self);
