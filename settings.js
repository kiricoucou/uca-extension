(function () {
"use strict";

/* Chaque réglage : clé de UCA_SETTINGS_DEFAULTS, type "select" (options [valeur, libellé])
   ou "switch". Ajouter un réglage = ajouter une ligne ici + sa valeur par défaut. */
const SECTIONS = [
  { title: "Affichage", fields: [
    { key: "startView", type: "select", label: "Vue à l'ouverture", hint: "« Automatique » : Semaine sur ordinateur (5 jours si rien aujourd'hui), Jour sur téléphone.",
      options: [["auto", "Automatique"], ["day", "Jour"], ["3day", "3 jours"], ["5day", "5 jours"], ["6day", "6 jours"], ["week", "Semaine"], ["month", "Mois"]] },
    { key: "hideWeekend", type: "switch", label: "Masquer le week-end", hint: "Vue Semaine : samedi et dimanche n'apparaissent que s'il y a cours." },
  ] },
];

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

let savedTimer = 0;
function flashSaved() {
  $("saved").classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
}
function save(key, value) { UCA_saveSettings({ [key]: value }).then(flashSaved); }

function control(field, value) {
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
    const s = el("section"); s.appendChild(el("h2", "", sec.title));
    sec.fields.forEach((f) => {
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

$("resetBtn").addEventListener("click", () => {
  chrome.storage.local.set({ uca_settings: Object.assign({}, UCA_SETTINGS_DEFAULTS) }).then(() => { render(UCA_SETTINGS_DEFAULTS); flashSaved(); });
});
$("agendaBtn").addEventListener("click", () => {
  Promise.all([fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()), chrome.storage.local.get("uca_design")])
    .then(([designs, d]) => {
      const design = designs.find((x) => x.id === d.uca_design);
      location.href = chrome.runtime.getURL(design ? `${design.folder}/agenda.html` : "choose.html?tab=1");
    });
});

UCA_getSettings().then(render);
})();
