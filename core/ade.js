/* Emploi du temps de TOUTE la classe, lu sur l'export iCalendar d'ADE (edt.uca.fr). L'adresse d'export (« Générer URL » dans
   https://edt.uca.fr/direct/myplanning.jsp) ne contient aucun jeton : seulement les numéros de ressources de la classe, et
   elle répond sans cookie. Elle accepte firstDate / lastDate, donc le passé aussi.
   Ce fichier ne contient que des fonctions pures (lecture du texte iCalendar, groupes, fusion), sans réseau ni stockage :
   il sert à l'extension (background.js), aux pages et à l'app Android (core/env.js). */
(function (root) {
"use strict";

const ADE_HOST = "edt.uca.fr";
const ADE_PAGE = "https://edt.uca.fr/direct/myplanning.jsp";
const ADE_PATH = "/jsp/custom/modules/plannings/anonymous_cal.jsp";
const pad = (n) => String(n).padStart(2, "0");

/* Garde seulement ce qui identifie la classe (ressources, projet, configuration d'affichage) : refuse toute autre adresse. */
function normalizeAdeUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.hostname !== ADE_HOST || u.pathname !== ADE_PATH) return null;
  const resources = u.searchParams.get("resources") || "", projectId = u.searchParams.get("projectId") || "", cfg = u.searchParams.get("displayConfigId") || "";
  if (!/^\d+(,\d+){0,30}$/.test(resources) || !/^\d{1,6}$/.test(projectId) || (cfg && !/^\d{1,6}$/.test(cfg))) return null;
  return `https://${ADE_HOST}${ADE_PATH}?resources=${resources}&projectId=${projectId}&calType=ical${cfg ? "&displayConfigId=" + cfg : ""}`;
}

/* Adresse de l'export entre deux jours (AAAA-MM-JJ). */
function adeRangeUrl(base, firstDate, lastDate) { return `${base}&firstDate=${firstDate}&lastDate=${lastDate}`; }

/* Début de l'année universitaire en cours (1er septembre), pour aller chercher tout le passé de l'année. */
function academicYearStart(now) {
  const t = now ? new Date(now) : new Date();
  const y = t.getMonth() >= 8 ? t.getFullYear() : t.getFullYear() - 1;
  return `${y}-09-01`;
}
function dayKeyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

const EVENT_PALETTE = ["#1967d2", "#0b8043", "#8e24aa", "#c5221f", "#b06000", "#3f51b5", "#00796b", "#ad1457", "#5f6368", "#795548"];
function colorFor(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return EVENT_PALETTE[h % EVENT_PALETTE.length]; }

function unfold(text) { return String(text).replace(/\r?\n[ \t]/g, ""); }
function unescapeIcs(s) { return String(s).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }
function parseDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  if (m[4] === undefined) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
const GROUP_RE = /^\d?[A-Z]{1,3}[A-Z0-9]*$/;   // 1A, 1ATDA, 1ATP2…

/* Texte iCalendar d'ADE -> cours { date, year, month, day, startH, startM, endH, endM, title, teacher, room, group, raw, color }.
   Les heures sont en UTC dans l'export : Date les ramène à l'heure locale. */
function parseAdeIcs(text) {
  const out = [];
  unfold(text).split("BEGIN:VEVENT").slice(1).forEach((block) => {
    const body = block.split("END:VEVENT")[0];
    const get = (name) => { const m = new RegExp("^" + name + "(?:;[^:\\r\\n]*)?:(.*)$", "m").exec(body); return m ? m[1].replace(/\r$/, "") : ""; };
    const s = parseDate(get("DTSTART")), e = parseDate(get("DTEND"));
    const title = unescapeIcs(get("SUMMARY")).trim();
    if (!s || !e || !title) return;
    const lines = unescapeIcs(get("DESCRIPTION")).split("\n").map((l) => l.trim()).filter((l) => l && !/^\(Updated/i.test(l));
    const group = lines.find((l) => GROUP_RE.test(l)) || "";
    const teacher = lines.filter((l) => l !== group).join(", ");
    const room = unescapeIcs(get("LOCATION")).replace(/\s*,\s*/g, ", ").trim();
    out.push({
      date: dayKeyOf(s), year: s.getFullYear(), month: s.getMonth(), day: s.getDate(),
      startH: s.getHours(), startM: s.getMinutes(), endH: e.getHours(), endM: e.getMinutes(),
      title, teacher, room, group, raw: lines.join("\n"), color: colorFor(title.replace(/\b(CM|TD|TDA|TDB|TP|TPA)\b/gi, "").trim() || title),
    });
  });
  return out.sort((a, b) => (a.date + pad(a.startH) + pad(a.startM)).localeCompare(b.date + pad(b.startH) + pad(b.startM)));
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* Groupes de l'utilisateur, trouvés grâce à l'emploi du temps d'Odin : un cours d'Odin (même jour, mêmes heures, même
   intitulé écrit de la même façon) retrouvé dans l'emploi du temps de la classe donne son groupe (« 1ATP2 »…). */
function deriveMyGroups(personal, classEvents) {
  const key = (e) => [e.date, e.startH, e.startM, e.endH, e.endM, norm(e.title)].join("|");
  const byKey = new Map();
  (classEvents || []).forEach((c) => { const k = key(c); if (!byKey.has(k)) byKey.set(k, new Set()); if (c.group) byKey.get(k).add(c.group); });
  const count = new Map();
  (personal || []).forEach((p) => {
    const g = byKey.get(key(p));
    if (g && g.size === 1) { const only = [...g][0]; count.set(only, (count.get(only) || 0) + 1); }   // cours propre à un seul groupe
  });
  return [...count.keys()].sort();
}

/* Cours de la classe qui concernent l'utilisateur : ses groupes + les cours de toute l'année (sans groupe précis). */
function personalFromClass(classEvents, groups) {
  const mine = new Set(groups || []);
  const wholeYear = new Set((classEvents || []).map((c) => c.group).filter((g) => g && /^\d[A-Z]$/.test(g)));
  return (classEvents || []).filter((c) => !c.group || mine.has(c.group) || wholeYear.has(c.group));
}

/* Complète le passé : les jours passés absents de l'emploi du temps personnel sont reconstitués à partir de la classe.
   Les jours déjà connus (Odin) ne sont jamais touchés. */
function fillPast(personal, fromClass, now) {
  const today = dayKeyOf(now ? new Date(now) : new Date());
  const known = new Set((personal || []).map((e) => e.date));
  const add = (fromClass || []).filter((c) => c.date < today && !known.has(c.date));
  return (personal || []).concat(add).sort((a, b) => (a.date + pad(a.startH) + pad(a.startM)).localeCompare(b.date + pad(b.startH) + pad(b.startM)));
}

root.UCA_ADE = { ADE_HOST, ADE_PAGE, normalizeAdeUrl, adeRangeUrl, academicYearStart, parseAdeIcs, deriveMyGroups, personalFromClass, fillPast };
})(self);
