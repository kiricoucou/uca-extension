/* Filtres et export .ics, communs à tous les designs. Chargé après shared.js, avant agenda.js.
   Expose UCA_TOOLS : état des filtres, test d'un cours, construction des panneaux, export. */
(function () {
"use strict";

const TYPES = ["CM", "TD", "TP", "Examen", "Autre"];
let filters = { q: "", types: [], hidden: [] };
let onChange = () => {};

function pad(n) { return String(n).padStart(2, "0"); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

function typeOf(title) {
  const m = title.match(/\b(CM|TDA?|TPA?|Examen|DS|Partiel)\b/i);
  if (!m) return "Autre";
  const t = m[1].toUpperCase();
  return t.startsWith("TD") ? "TD" : t.startsWith("TP") ? "TP" : t === "CM" ? "CM" : "Examen";
}
function subjectOf(title) {
  const code = title.match(/^(SAE|R)\s?\d+(?:\.\d+)*/i);
  if (code) return code[0].replace(/\s/g, "").toUpperCase();
  return title.replace(/\b(CM|TDA?|TPA?|Examen)\b/gi, "").replace(/[:\-–]\s*$/, "").replace(/\s+/g, " ").trim() || title;
}
function activeCount() { return (filters.q ? 1 : 0) + (filters.types.length ? 1 : 0) + (filters.hidden.length ? 1 : 0); }
function passes(ev) {
  if (filters.types.length && !filters.types.includes(typeOf(ev.title))) return false;
  if (filters.hidden.includes(subjectOf(ev.title))) return false;
  if (filters.q) {
    const hay = `${ev.title} ${ev.teacher || ""} ${ev.room || ""}`.toLowerCase();
    if (!filters.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
function save() { chrome.storage.local.set({ uca_filters: filters }); onChange(); }

/* ============================= Panneau Filtres ============================= */
function buildFilterPanel(panel, allEvents) {
  panel.innerHTML = "";
  const search = el("input", "fp-search"); search.type = "search"; search.placeholder = "Rechercher une matière, un prof, une salle…";
  search.value = filters.q;
  search.addEventListener("input", () => { filters.q = search.value.trim(); save(); });
  panel.appendChild(search);
  panel.appendChild(el("div", "fp-h", "Type de cours"));
  const chips = el("div", "fp-chips");
  TYPES.forEach((t) => {
    const c = el("button", "fp-chip" + (filters.types.includes(t) ? " on" : ""), t); c.type = "button";
    c.addEventListener("click", () => {
      filters.types = filters.types.includes(t) ? filters.types.filter((x) => x !== t) : filters.types.concat(t);
      c.classList.toggle("on"); save();
    });
    chips.appendChild(c);
  });
  panel.appendChild(chips);
  panel.appendChild(el("div", "fp-h", "Matières affichées"));
  const list = el("div", "fp-list");
  const subjects = [...new Set(allEvents.map((e) => subjectOf(e.title)))].sort((a, b) => a.localeCompare(b, "fr"));
  subjects.forEach((sub) => {
    const row = el("label", "fp-item");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !filters.hidden.includes(sub);
    cb.addEventListener("change", () => {
      filters.hidden = cb.checked ? filters.hidden.filter((x) => x !== sub) : filters.hidden.concat(sub);
      save();
    });
    row.append(cb, el("span", "", sub));
    list.appendChild(row);
  });
  if (!subjects.length) list.appendChild(el("div", "fp-empty", "Synchronise pour voir tes matières."));
  panel.appendChild(list);
  const foot = el("div", "fp-foot");
  const reset = el("button", "fp-reset", "Tout afficher"); reset.type = "button";
  reset.addEventListener("click", () => { filters = { q: "", types: [], hidden: [] }; save(); buildFilterPanel(panel, allEvents); });
  foot.appendChild(reset);
  panel.appendChild(foot);
}

/* ============================= Export .ics ============================= */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) {
  const out = []; let cur = line;
  while (cur.length > 73) { out.push(cur.slice(0, 73)); cur = " " + cur.slice(73); }
  out.push(cur);
  return out.join("\r\n");
}
function localStamp(ev, h, m) { return `${ev.year}${pad(ev.month + 1)}${pad(ev.day)}T${pad(h)}${pad(m)}00`; }
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); }

function buildIcs(evs, { alarmMinutes, eventKey, tasks }) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EDT UCA (non officiel)//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Emploi du temps UCA", "X-WR-TIMEZONE:Europe/Paris", ...VTIMEZONE];
  evs.forEach((ev) => {
    lines.push("BEGIN:VEVENT", `UID:${hash(eventKey(ev))}-${ev.date}@edt-uca`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Paris:${localStamp(ev, ev.startH, ev.startM)}`, `DTEND;TZID=Europe/Paris:${localStamp(ev, ev.endH, ev.endM)}`,
      `SUMMARY:${icsEscape(ev.title)}`);
    if (ev.room) lines.push(`LOCATION:${icsEscape(ev.room)}`);
    if (ev.teacher) lines.push(`DESCRIPTION:${icsEscape("Enseignant : " + ev.teacher)}`);
    if (alarmMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, `TRIGGER:-PT${alarmMinutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  });
  // Devoirs à rendre : événements « journée entière » avec rappel la veille à 18 h (6 h avant minuit).
  (tasks || []).forEach((t) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.due || "");
    if (!m) return;
    const next = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1);
    const nextStamp = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    lines.push("BEGIN:VEVENT", `UID:${hash("task|" + t.id)}-${t.due}@edt-uca`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${m[1]}${m[2]}${m[3]}`, `DTEND;VALUE=DATE:${nextStamp}`, `SUMMARY:${icsEscape("Devoir : " + t.title)}`);
    if (t.subject) lines.push(`DESCRIPTION:${icsEscape("Matière : " + t.subject)}`);
    if (alarmMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape("Devoir : " + t.title)}`, "TRIGGER:-PT6H", "END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = el("a"); a.href = url; a.download = name;
  // Clic sans propagation : sinon il passe pour un clic hors du panneau ouvert, qui se fermerait.
  document.body.appendChild(a); a.dispatchEvent(new MouseEvent("click", { bubbles: false })); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* opts : { allEvents, weekDays(), eventKey, reminderMinutes } */
function buildExportPanel(panel, opts) {
  panel.innerHTML = "";
  panel.appendChild(el("div", "fp-h", "Exporter vers Google Agenda, Outlook, téléphone…"));
  const ranges = [["week", "Semaine affichée"], ["4w", "4 prochaines semaines"], ["all", "Tout l'emploi du temps synchronisé"]];
  const group = el("div", "xp-group");
  ranges.forEach(([v, l], i) => {
    const row = el("label", "fp-item");
    const r = el("input"); r.type = "radio"; r.name = "xpRange"; r.value = v; r.checked = i === 1;
    row.append(r, el("span", "", l));
    group.appendChild(row);
  });
  panel.appendChild(group);
  const mkCheck = (label, checked) => { const row = el("label", "fp-item"); const cb = el("input"); cb.type = "checkbox"; cb.checked = checked; row.append(cb, el("span", "", label)); panel.appendChild(row); return cb; };
  const useFilters = mkCheck("Appliquer mes filtres", activeCount() > 0);
  const alarm = mkCheck(`Ajouter un rappel ${opts.reminderMinutes} min avant chaque cours`, true);
  const openTasks = (opts.tasks || []).filter((t) => !t.done && t.due);
  const withTasks = openTasks.length ? mkCheck(`Ajouter mes devoirs à rendre (${openTasks.length})`, true) : null;
  const btn = el("button", "xp-go", "Télécharger le fichier .ics"); btn.type = "button";
  const info = el("div", "fp-empty");
  btn.addEventListener("click", () => {
    const range = panel.querySelector("input[name=xpRange]:checked").value;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let evs = opts.allEvents.slice();
    if (range === "week") { const keys = new Set(opts.weekDays().map((d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)); evs = evs.filter((e) => keys.has(e.date)); }
    else if (range === "4w") { const lim = new Date(today.getTime() + 28 * 86400000); evs = evs.filter((e) => { const d = new Date(e.year, e.month, e.day); return d >= today && d < lim; }); }
    if (useFilters.checked) evs = evs.filter(passes);
    evs.sort((a, b) => a.date.localeCompare(b.date) || (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
    const tk = withTasks && withTasks.checked ? openTasks : [];
    if (!evs.length && !tk.length) { info.textContent = "Aucun cours dans cette période."; return; }
    download("emploi-du-temps-uca.ics", buildIcs(evs, { alarmMinutes: alarm.checked ? opts.reminderMinutes : 0, eventKey: opts.eventKey, tasks: tk }));
    info.textContent = `${evs.length} cours${tk.length ? ` et ${tk.length} devoir${tk.length > 1 ? "s" : ""}` : ""} exportés. Ouvre le fichier pour l'ajouter à ton agenda. Il reflète ta dernière synchro : réexporte-le après une synchro.`;
  });
  panel.append(btn, info);
  // Image à envoyer à un camarade : feuille de partage du téléphone si possible, sinon fichier PNG.
  if (opts.shareImage && window.UCA_SHARE_IMAGE) {
    panel.appendChild(el("div", "fp-h", "Partager une image"));
    const imgInfo = el("div", "fp-empty"); imgInfo.setAttribute("role", "status");
    [["day", "Le jour affiché"], ["week", "La semaine affichée"]].forEach(([kind, label]) => {
      const b = el("button", "xp-phone xp-image", label); b.type = "button"; b.dataset.kind = kind;
      b.addEventListener("click", async () => {
        b.disabled = true; imgInfo.textContent = "Création de l'image…";
        try {
          const r = await window.UCA_SHARE_IMAGE.render(kind, opts.shareImage[kind]());
          const res = await window.UCA_SHARE_IMAGE.share(r);
          imgInfo.textContent = res === "shared" ? "Image partagée." : res === "cancelled" ? "" : `Image enregistrée (${r.name}).`;
        } catch (e) { imgInfo.textContent = "Impossible de créer l'image."; }
        b.disabled = false;
      });
      panel.appendChild(b);
    });
    panel.appendChild(imgInfo);
  }
  // Lien direct : seulement en dehors de l'app (l'app n'a pas besoin de s'envoyer un lien à elle-même).
  if (opts.shareLink) {
    panel.appendChild(el("div", "fp-h", "Sur ton téléphone"));
    const linkInfo = el("div", "fp-empty");
    const link = el("button", "xp-phone", "Copier un lien pour l'app"); link.type = "button";
    link.addEventListener("click", async () => {
      // Le lien transporte tout l'emploi du temps synchronisé (comme le QR/fichier), pas seulement
      // la période choisie ci-dessus : l'app applique ensuite ses propres filtres et vues.
      const share = await opts.shareLink();
      try {
        await navigator.clipboard.writeText(share.link);
        const original = link.textContent;
        link.textContent = "Le lien est bien copié"; link.disabled = true;
        setTimeout(() => { link.textContent = original; link.disabled = false; }, 2500);
        linkInfo.textContent = `${share.message}. Lien chiffré, jamais gardé par GitHub ni aucun serveur.`;
      } catch {
        let box = panel.querySelector(".xp-link-fallback");
        if (!box) { box = el("input", "xp-link-fallback"); box.readOnly = true; panel.insertBefore(box, linkInfo); }
        box.value = share.link; box.hidden = false; box.focus(); box.select();
        linkInfo.textContent = `Presse-papiers indisponible : copie le lien ci-dessus à la main. ${share.message}.`;
      }
    });
    panel.append(link, linkInfo);
    if (opts.canShare && opts.canShare()) {
      const share = el("button", "xp-phone", "Partager le lien…"); share.type = "button";
      share.addEventListener("click", async () => {
        const s = await opts.shareLink();
        try { await opts.sendLink(s); linkInfo.textContent = `${s.message}. Envoie le code séparément si besoin.`; }
        catch (e) { linkInfo.textContent = "Partage impossible : utilise « Copier un lien »."; }
      });
      panel.insertBefore(share, linkInfo);
    }
  }
  if (opts.onPhone) {
    const qr = el("button", "xp-phone", "Afficher le QR code (première installation)"); qr.type = "button";
    qr.addEventListener("click", () => opts.onPhone());
    panel.appendChild(qr);
  }
}

/* ============================= Pages publiques (GitHub Pages) =============================
   Les pages réellement servies à la racine du dépôt (hors pages internes par design — aide.html
   et confidentialite.html existent aussi dans chaque designs/<id>/, ce ne sont pas celles-ci). */
const SITE_ROOT = "https://kiricoucou.github.io/uca-extension/";
const PUBLIC_PAGES = [
  { label: "Accueil", hint: "Présentation et comparatif des quatre façons d'utiliser l'EDT", path: "index.html" },
  { label: "Aide", hint: "Toutes les questions fréquentes, avec recherche", path: "aide.html" },
  { label: "Installer l'app — lien court", hint: "Adresse courte à partager (redirige vers le guide)", path: "install.html" },
  { label: "Installer l'app — guide détaillé", hint: "Étapes Android, iPhone et ordinateur", path: "app/install.html" },
  { label: "Agenda en ligne", hint: "La même app, dans un simple onglet", path: "app/index.html" },
  { label: "Importer mes données", hint: "Scanner un QR, coller un lien ou choisir un fichier", path: "app/import.html" },
  { label: "Politique de confidentialité", hint: "Quelles données, où elles sont stockées, toutes les connexions réseau", path: "confidentialite.html" },
  { label: "Page introuvable (404)", hint: "Pour vérifier qu'elle s'affiche bien", path: "404.html" },
];
function buildLinksPanel(panel) {
  panel.innerHTML = "";
  panel.appendChild(el("div", "fp-h", "Pages publiées sur GitHub Pages"));
  PUBLIC_PAGES.forEach((p) => {
    const btn = el("button", "xp-phone", p.label); btn.type = "button"; btn.title = p.hint;
    btn.addEventListener("click", () => window.open(SITE_ROOT + p.path, "_blank", "noopener"));
    panel.appendChild(btn);
  });
  // App ouverte dans un navigateur (pas encore installée) : rappel du guide d'installation, à tout moment.
  if (window.UCA_APP && !(matchMedia("(display-mode: standalone)").matches || navigator.standalone === true)) {
    const inst = el("button", "xp-phone", "Installer l'app sur l'écran d'accueil"); inst.type = "button"; inst.id = "installLink";
    inst.title = "Guide d'installation (Android, iPhone)";
    inst.addEventListener("click", () => { location.href = chrome.runtime.getURL("app/install.html?force=1"); });
    panel.appendChild(inst);
  }
}


/* ============================= Prochain cours / jours fériés ============================= */
function startMs(ev) { return new Date(ev.year, ev.month, ev.day, ev.startH, ev.startM).getTime(); }
function endMs(ev) { return new Date(ev.year, ev.month, ev.day, ev.endH, ev.endM).getTime(); }

/* Cours en cours, sinon prochain cours (n'importe quel jour), en respectant les filtres actifs.
   -> { ev, ongoing, minutes } : minutes avant la fin (en cours) ou avant le début. */
function nextCourse(evs, now) {
  const t = now === undefined ? Date.now() : now;
  const list = evs.filter((e) => passes(e) && endMs(e) > t).sort((a, b) => startMs(a) - startMs(b));
  const cur = list.find((e) => startMs(e) <= t);
  // Prochain examen (autre que le cours en tête), pour l'annoncer même quand un cours passe avant.
  const examAfter = (head) => list.find((e) => e !== head && startMs(e) > t && typeOf(e.title) === "Examen");
  const calDays = (e) => { const a = new Date(startMs(e)), b = new Date(t); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 86400000); };
  const wrap = (ev, ongoing, minutes) => {
    const r = { ev, ongoing, minutes: Math.max(1, Math.ceil(minutes)), isExam: typeOf(ev.title) === "Examen", days: calDays(ev) };
    const ex = r.isExam ? null : examAfter(ev);
    if (ex) r.exam = { ev: ex, minutes: Math.max(1, Math.ceil((startMs(ex) - t) / 60000)), days: calDays(ex) };
    return r;
  };
  if (cur) return wrap(cur, true, (endMs(cur) - t) / 60000);
  const next = list[0];
  return next ? wrap(next, false, (startMs(next) - t) / 60000) : null;
}
function durationText(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return h < 24 ? `${h} h${m ? " " + pad(m) : ""}` : "";
}
// « 3 h 15 », « 40 min », « 2 jours » (jours du calendrier, comme la liste des examens) pour les examens, qui peuvent être loin.
function untilText(min, days) {
  const d = durationText(min);
  if (d) return d;
  return `${days} jour${days > 1 ? "s" : ""}`;
}
function nextCourseText(res, now) {
  if (!res) return "";
  const ev = res.ev, place = ev.room ? " · " + ev.room : "";
  if (res.ongoing) return `En cours : ${res.isExam ? "Examen · " : ""}${ev.title}${place} (fin dans ${durationText(res.minutes)})`;
  const d = durationText(res.minutes);
  if (res.isExam) return `Examen dans ${untilText(res.minutes, res.days)} : ${ev.title}${place}`;
  const exam = res.exam ? ` · Examen dans ${untilText(res.exam.minutes, res.exam.days)}` : "";
  if (d) return `Prochain : ${ev.title}${place} · dans ${d}${exam}`;
  const when = new Date(ev.year, ev.month, ev.day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return `Prochain : ${ev.title}${place} · ${when} ${pad(ev.startH)}h${pad(ev.startM)}${exam}`;
}

/* Jours fériés français (calculés, aucune donnée externe) : fixes + lundi de Pâques, Ascension, lundi de Pentecôte.
   Les vacances ne sont pas listées : le calendrier universitaire diffère de celui des écoles. */
const holidayCache = {};
function holidaysOf(year) {
  if (holidayCache[year]) return holidayCache[year];
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const map = {};
  const put = (dt, name) => { map[`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`] = name; };
  [[0, 1, "Jour de l'an"], [4, 1, "Fête du Travail"], [4, 8, "Victoire 1945"], [6, 14, "Fête nationale"], [7, 15, "Assomption"],
    [10, 1, "Toussaint"], [10, 11, "Armistice 1918"], [11, 25, "Noël"]].forEach(([mo, dd, n]) => put(new Date(year, mo, dd), n));
  [[1, "Lundi de Pâques"], [39, "Ascension"], [50, "Lundi de Pentecôte"]].forEach(([plus, n]) => put(new Date(year, month - 1, day + plus), n));
  holidayCache[year] = map;
  return map;
}
function holidayName(date) { return holidaysOf(date.getFullYear())[`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`] || ""; }

window.UCA_TOOLS = {
  nextCourse, nextCourseText, holidayName,
  TYPES, typeOf, subjectOf, passes, activeCount, buildFilterPanel, buildExportPanel, buildIcs, buildLinksPanel,
  load(cb) {
    chrome.storage.local.get("uca_filters", (d) => { filters = Object.assign({ q: "", types: [], hidden: [] }, d.uca_filters); cb(); });
  },
  onChange(fn) { onChange = fn; },
};
})();
