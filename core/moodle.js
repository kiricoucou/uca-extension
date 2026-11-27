/* Notes Moodle : lecture des pages de notes, détection des nouvelles notes et fusion (après validation de
   l'utilisateur) dans le relevé Odin. Aucun accès réseau ici : fonctions pures, chargées par le service worker,
   l'agenda et les tests.

   Rien n'entre dans les moyennes sans accord : une note vue sur Moodle est « pending » ; l'utilisateur la
   valide (elle rejoint le tableau des notes) ou la refuse (ignorée pour toujours, tant que sa valeur ne change
   pas : des contrôles fictifs existent sur Moodle).

   Page lue de travers ≠ aucune note : voir parseReport (ok, anomalies).

   Magasin (uca_moodle) :
   { sync: ISO, items: { "MDL|<cours>|<activité>": { id, courseId, course, title, type, raw, max, note20,
     feedback, matiere, coeff, status: "pending" | "validated" | "refused" (= dans la corbeille) | "deleted", at, decidedAt } } } */
(function (root) {
"use strict";

const ITEM_MAX = 2000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…" };
function decode(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    const v = ENTITIES[e.toLowerCase()]; return v === undefined ? m : v;
  });
}
function text(html) {
  return decode(String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/[\s ]+/g, " ").trim();
}
function num(s) {
  const m = /-?\d+(?:[.,]\d+)?/.exec(String(s || "")); if (!m) return null;
  const n = parseFloat(m[0].replace(",", ".")); return Number.isFinite(n) ? n : null;
}
function round3(n) { return Math.round(n * 1000) / 1000; }

/* Page « Notes » du profil (/grade/report/overview/index.php) : cours suivis et identifiant utilisateur.
   Les liens ont la forme course/user.php?mode=grade&id=<cours>&user=<utilisateur>. */
function parseOverview(html) {
  // Les liens et leurs paramètres changent d'une année / d'un cours à l'autre : on ne suppose ni l'ordre
  // des paramètres ni l'identifiant du cours, seulement qu'un lien course/user.php porte id= et user=.
  const re = /<a\b[^>]*href="([^"]*course\/user\.php\?[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const courses = [], seen = new Set(); let userId = null, m;
  while ((m = re.exec(html || ""))) {
    const q = decode(m[1]).split("?")[1] || "";
    const p = {}; q.split("&").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) p[kv.slice(0, i)] = kv.slice(i + 1); });
    if (!/^\d+$/.test(p.id || "")) continue;
    if (/^\d+$/.test(p.user || "")) userId = userId || p.user;
    if (seen.has(p.id)) continue; seen.add(p.id);
    courses.push({ id: p.id, name: text(m[2]) });
  }
  // ok = c'est bien la page « Notes » (sinon une liste vide ne veut rien dire).
  const ok = courses.length > 0 || /id\s*=\s*["'](overview-grade|page-grade-report-overview-index)["']/i.test(html || "");
  return { userId, courses, ok };
}

/* ---------- Lecture des pages ----------
   Pas de DOMParser (absent du service worker) : un petit analyseur qui suit l'imbrication des balises. Une page n'est
   jamais prise pour « aucune note » : parseReport dit si c'est bien un rapport de notes complet, et sinon pourquoi. */
const TAG_ATTRS = "((?:\"[^\"]*\"|'[^']*'|[^'\">])*)";
function attr(attrs, name) {
  const m = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(attrs || "");
  return m ? decode(m[2] !== undefined ? m[2] : m[3]) : "";
}
function hasClass(attrs, cls) { return (" " + attr(attrs, "class").replace(/\s+/g, " ") + " ").includes(" " + cls + " "); }
function clean(html) { return String(html || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<template\b[\s\S]*?<\/template>/gi, " "); }

/* Contenu de l'élément ouvert en « start » (juste après sa balise ouvrante), balises de même nom imbriquées comprises. */
function innerOf(html, tag, start) {
  const re = new RegExp("<(/?)" + tag + "\\b" + TAG_ATTRS + ">", "gi");
  re.lastIndex = start; let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) { if (--depth === 0) return { inner: html.slice(start, m.index), end: re.lastIndex, closed: true }; }
    else if (!/\/$/.test(m[2])) depth++;
  }
  return { inner: html.slice(start), end: html.length, closed: false };
}
/* Premier élément (div, span, a) portant la classe demandée. */
function byClass(html, cls) {
  const re = new RegExp("<(div|span|a)\\b" + TAG_ATTRS + ">", "gi"); let m;
  while ((m = re.exec(html))) if (hasClass(m[2], cls)) return innerOf(html, m[1], re.lastIndex).inner;
  return null;
}
/* Retire les menus « Actions » que Moodle glisse dans la cellule de la note (leur texte n'est pas la note). */
function dropMenus(html) {
  let out = html;
  for (;;) {
    const re = new RegExp("<(div)\\b" + TAG_ATTRS + ">", "gi"); let m, hit = null;
    while ((m = re.exec(out))) if (/(^|\s)(action-menu|dropdown|dropdown-menu)(\s|$)/.test(attr(m[2], "class"))) { hit = { from: m.index, body: re.lastIndex }; break; }
    if (!hit) return out;
    out = out.slice(0, hit.from) + " " + out.slice(innerOf(out, "div", hit.body).end);
  }
}

/* Lignes et cellules du premier tableau « user-grade » ; les tableaux imbriqués (commentaires) restent dans leur cellule. */
function readTable(html) {
  const open = new RegExp("<table\\b" + TAG_ATTRS + ">", "gi"); let m, start = -1;
  while ((m = open.exec(html))) if (hasClass(m[1], "user-grade")) { start = open.lastIndex; break; }
  if (start < 0) return null;
  const re = new RegExp("<(/?)(table|tr|th|td)\\b" + TAG_ATTRS + ">", "gi");
  re.lastIndex = start;
  const rows = []; let depth = 1, row = null, cell = null, t;
  const closeCell = (at) => { if (cell) { cell.html = html.slice(cell.from, at); cell = null; } };
  while ((t = re.exec(html))) {
    const closing = !!t[1], tag = t[2].toLowerCase();
    if (tag === "table") {
      depth += closing ? -1 : 1;
      if (depth === 0) { closeCell(t.index); return { rows, closed: true }; }
      continue;
    }
    if (depth !== 1) continue;
    if (tag === "tr") { closeCell(t.index); row = closing ? null : { attrs: t[3], cells: [] }; if (row) rows.push(row); }
    else if (closing) closeCell(t.index);
    else { closeCell(t.index); if (!row) { row = { attrs: "", cells: [] }; rows.push(row); } cell = { tag, attrs: t[3], from: re.lastIndex, html: "" }; row.cells.push(cell); }
  }
  closeCell(html.length);
  return { rows, closed: false };
}

const COLUMNS = ["itemname", "weight", "grade", "range", "feedback", "contributiontocoursetotal"];
const HEADER_TEXT = [["itemname", /l[ée]ment d.[ée]valuation|grade item/i], ["weight", /pond[ée]ration|weight/i], ["grade", /^note$|^grade$/i],
  ["range", /valeurs possibles|bar[èe]me|[ée]tendue|^range$/i], ["feedback", /feedback|commentaire/i], ["contributiontocoursetotal", /contribution/i]];
/* Trois façons de savoir à quelle colonne appartient une cellule, de la plus sûre à la plus fragile :
   la classe column-…, l'attribut headers (« … grade123 »), puis la position d'après le texte des en-têtes. */
function columnReader(rows) {
  const head = rows.find((r) => r.cells.length > 1 && r.cells.every((c) => c.tag === "th"));
  const byPosition = [];
  if (head) head.cells.forEach((c) => {
    const label = text(c.html), hit = HEADER_TEXT.find(([, re]) => re.test(label));
    const span = Number(attr(c.attrs, "colspan")) || 1;
    byPosition.push(hit ? hit[0] : null);
    if (span > 1 && !(hit && hit[0] === "itemname")) for (let i = 1; i < span; i++) byPosition.push(null);
  });
  const used = new Set();
  return {
    head, used,
    cells(row) {
      const out = {};
      row.cells.forEach((c, index) => {
        let name = COLUMNS.find((n) => hasClass(c.attrs, "column-" + n)), how = "classes";
        if (!name) {
          const tokens = attr(c.attrs, "headers").split(/\s+/);
          name = COLUMNS.find((n) => tokens.some((k) => new RegExp("^" + n + "\\d*$").test(k))); how = "attribut headers";
        }
        if (!name) { name = byPosition[index] || null; how = "texte des en-têtes"; }
        if (name && !out[name]) { out[name] = c; used.add(how); }
      });
      return out;
    },
  };
}

const NUM = "-?\\d+(?:[.,]\\d+)?";
function toNum(s) { const n = parseFloat(String(s).replace(",", ".")); return Number.isFinite(n) ? n : null; }
function cellText(c) { return c ? text(dropMenus(c.html)) : ""; }
function emptyGrade(s) { return !s || /^[-–—−]+$/.test(s); }

/* Rapport de notes d'un cours.
   -> { ok, reason, grades, anomalies, ignored, rows: [identifiants des lignes d'activité vues], strategy }
   ok = false : la page n'est PAS un rapport complet et lisible ; il ne faut rien en conclure.
   anomalies : lignes avec une note que l'on n'a pas su lire (le cours est alors incomplet).
   ignored : notes sans valeur chiffrée (« Terminé », « Acquis ») : normales, mais signalées. */
function parseReport(html, courseId) {
  const src = clean(html);
  const fail = (reason) => ({ ok: false, reason, grades: [], anomalies: [], ignored: [], rows: [], strategy: "" });
  const body = /<body\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i.exec(src);
  const bodyClass = body ? attr(body[1], "class") : "";
  const table = readTable(src);
  if (!table) return fail(/type\s*=\s*["']password["']/i.test(src) ? "session" : "tableau de notes introuvable");
  if (courseId && /(^|\s)path-/.test(bodyClass) && /(^|\s)course-\d+(\s|$)/.test(bodyClass) && !new RegExp("(^|\\s)course-" + courseId + "(\\s|$)").test(bodyClass)) return fail("la page est celle d'un autre cours");
  if (!table.closed) return fail("page coupée avant la fin du tableau");
  const columns = columnReader(table.rows);
  const grades = [], anomalies = [], ignored = [], rows = [];
  let category = "", structural = 0, itemRows = 0, noGradeCell = 0;
  table.rows.forEach((row) => {
    if (row === columns.head) return;
    // Une ligne d'activité, de catégorie ou de total a toujours une cellule d'en-tête (les lignes d'espacement n'en ont pas).
    if (!row.cells.some((c) => c.tag === "th")) return;
    const named = row.cells.find((c) => c.tag === "th" && (hasClass(c.attrs, "column-itemname") || /^(row|cat)_\d+/.test(attr(c.attrs, "id"))));
    const cells = columns.cells(row);
    const th = named || (cells.itemname && cells.itemname.tag === "th" ? cells.itemname : null);
    if (!th) return;
    structural++;
    if (hasClass(th.attrs, "category") || /^cat_/.test(attr(th.attrs, "id"))) { category = text(th.html); return; }
    const typeM = /<span\b[^>]*text-uppercase[^>]*>([\s\S]*?)<\/span>/i.exec(th.html);
    const type = typeM ? text(typeM[1]) : "";
    const titleHtml = byClass(th.html, "gradeitemheader") !== null ? byClass(th.html, "gradeitemheader") : byClass(th.html, "rowtitle");
    const title = titleHtml !== null ? text(titleHtml) : text(th.html.replace(typeM ? typeM[0] : "", " "));
    if (hasClass(th.attrs, "baggt") || hasClass(th.attrs, "baggb") || /tendance centrale|total du cours|^total\b/i.test(type + " " + title)) return;
    itemRows++;
    const idM = /^row_(\d+)_\d+/.exec(attr(th.attrs, "id"));
    const modM = /href\s*=\s*["'][^"']*\/mod\/([a-z0-9_]+)\/view\.php\?(?:[^"']*?(?:&|&amp;))?id=(\d+)/i.exec(th.html);
    const gradeId = idM ? idM[1] : "", cmid = modM ? modM[1].toLowerCase() + ":" + modM[2] : "";
    const key = gradeId ? "#" + gradeId : cmid ? "@" + cmid : "";
    rows.push({ ref: key, title });
    const bad = (reason) => anomalies.push({ ref: key, title: title || "(titre introuvable)", reason });
    if (!cells.grade) { noGradeCell++; return bad("colonne de la note introuvable"); }
    const gradeTxt = cellText(cells.grade);
    if (emptyGrade(gradeTxt) || /^[-–—−]\s/.test(gradeTxt)) return;
    if (!/\d/.test(gradeTxt)) { ignored.push({ ref: key, title, reason: "note non chiffrée : " + gradeTxt.slice(0, 40) }); return; }
    if (!title) return bad("titre introuvable");
    const g = new RegExp("^(" + NUM + ")\\s*(%)?(?:\\s*/\\s*(" + NUM + "))?(?:\\s*\\([^)]*\\))?(?:\\s+[^\\d]*)?$").exec(gradeTxt);
    if (!g) return bad("note illisible");
    const raw = toNum(g[1]);
    const rangeM = new RegExp("(" + NUM + ")\\s*[–—−-]\\s*(\\d+(?:[.,]\\d+)?)").exec(cellText(cells.range));
    const max = rangeM ? toNum(rangeM[2]) : g[3] !== undefined ? toNum(g[3]) : null;
    if (!max || max <= 0) return bad("barème introuvable");
    const value = g[2] ? raw / 100 * max : raw;
    const weightM = new RegExp("^(" + NUM + ")\\s*%").exec(cellText(cells.weight));
    const grade = { title, type, raw: value, max, note20: round3(value / max * 20), feedback: cellText(cells.feedback),
      gradeId, cmid, weight: weightM ? toNum(weightM[1]) : null, category, computed: /note calcul[ée]e|calculated/i.test(type) };
    grades.push(grade);
  });
  const strategy = [...columns.used].join(" + ");
  // Un vrai rapport contient toujours au moins une catégorie, un total ou une activité.
  if (!structural) return fail("tableau sans aucune ligne reconnue (structure inconnue)");
  if (itemRows && noGradeCell === itemRows) return fail("colonne de la note introuvable (structure inconnue)");
  return { ok: true, reason: "", grades, anomalies, ignored, rows, strategy };
}
/* Seulement les notes (ancienne forme, gardée pour les appels existants). */
function parseCourseGrades(html) { return parseReport(html).grades; }

/* Code de matière dans un intitulé : « R107 - … » -> R1.07, « SAE1.05 » -> SAE1.05, « SAE12 » -> SAE1.02. */
function codeOf(s) {
  const str = String(s || "");
  let m = /\bSAE\s*(\d)\.?(\d{1,2})\b/i.exec(str);
  if (m) return "SAE" + m[1] + "." + String(m[2]).padStart(2, "0");
  m = /\bR\s*(\d)\.?(\d{2})\b/i.exec(str);
  if (m) return "R" + m[1] + "." + m[2];
  return null;
}

/* Matières du relevé : { label, ue } dédoublonnées. */
function matieres(releve) {
  const out = [], seen = new Set();
  ((releve && releve.ue) || []).forEach((ue) => (ue.matieres || []).forEach((m) => {
    if (seen.has(m.label)) return; seen.add(m.label); out.push({ label: m.label, ue: ue.label });
  }));
  return out;
}

/* Matière du relevé qui correspond à un cours Moodle (par code), ou null. */
function matchMatiere(releve, courseName, title) {
  const list = matieres(releve);
  const code = codeOf(courseName) || codeOf(title);
  if (code) { const hit = list.find((m) => codeOf(m.label) === code); if (hit) return hit.label; }
  // Pas de code (ou code absent du relevé) : on rapproche les mots significatifs du cours et de la matière,
  // seulement si un seul candidat ressort nettement. Sinon null : l'utilisateur choisit à la validation.
  let best = null, bestScore = 0;
  list.forEach((m) => { const sc = similarity(courseName, m.label); if (sc > bestScore) { bestScore = sc; best = m.label; } });
  return best && bestScore >= SIMILAR_MIN ? best : null;
}
const STOP = new Set(["pour", "avec", "dans", "cours", "etudiants", "etudiant", "module", "initiation", "introduction", "fondamentaux", "les", "des", "une", "aux", "sur", "par", "et", "du", "de", "la", "le", "en"]);
/* Mots significatifs d'un intitulé (sans accents, sans code de matière, sans mots vides). */
function words(s) {
  return String(s || "").replace(/\b(?:SAE|R)\s*\d[\d.]*\b/gi, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && /[a-z]/.test(w) && !STOP.has(w));
}
function sameWord(x, y) {
  if (x === y) return true;
  if (x.length < 4 || y.length < 4) return false;
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i >= 4;            // « maths » et « mathématiques » partagent « math »
}
/* Ressemblance entre deux intitulés, de 0 à 1 : part des mots du plus court retrouvés dans l'autre. */
function similarity(a, b) {
  const A = words(a), B = words(b); if (!A.length || !B.length) return 0;
  const hits = A.filter((x) => B.some((y) => sameWord(x, y))).length;
  return hits / Math.min(A.length, B.length);
}
/* Nom proposé pour une matière créée à partir d'un cours Moodle : « R107 - Fondamentaux (R&T1) » -> « R1.07 : Fondamentaux ». */
function cleanCourseName(name) {
  const raw = String(name || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const code = codeOf(raw);
  if (!code) return raw;
  const rest = raw.replace(/\b(?:SAE|R)\s*\d[\d.]*\b/i, "").replace(/^[\s\-–—:·/]+|[\s\-–—:·/]+$/g, "").trim();
  return rest ? `${code} : ${rest}` : code;
}
/* Matières créées par l'utilisateur à partir de Moodle (notes validées « nouvelle matière »). */
function customMatieres(store) {
  const out = [], seen = new Set();
  list(store, "validated").forEach((x) => { if (x.isNew && x.matiere && !seen.has(x.matiere)) { seen.add(x.matiere); out.push(x.matiere); } });
  return out;
}
const SIMILAR_MIN = 0.5;
/* Proposition pour une note : 1) la matière du relevé qui porte le même code (R1.07, SAE1.05…) ; 2) sinon la plus
   proche par le nom du cours (si elle ressemble assez) ; 3) sinon « Créer une nouvelle matière », avec un nom proposé.
   C'est l'utilisateur qui confirme la matière (ou la création) et le coefficient avant l'ajout. */
function suggestMatiere(releve, courseName, title, store, courseId) {
  const known = matieres(releve).map((m) => m.label);
  const extra = customMatieres(store).filter((l) => !known.includes(l));
  const names = known.concat(extra);
  const code = codeOf(courseName) || codeOf(title);
  if (courseId) {
    // Mémoire : le choix le plus récent de l'utilisateur pour ce cours (si les notes de ce cours vont toutes dans la même matière).
    const chosen = list(store, "validated").filter((x) => x.courseId === courseId && x.matiere && names.includes(x.matiere));
    if (chosen.length && chosen.every((x) => x.matiere === chosen[0].matiere)) return { label: chosen[0].matiere, isNew: false, how: "memoire" };
  }
  if (code) { const hit = names.find((l) => codeOf(l) === code); if (hit) return { label: hit, isNew: false, how: "code" }; }
  let best = null, bestScore = 0;
  names.forEach((l) => { const sc = Math.max(similarity(courseName, l), similarity(title, l) * 0.8); if (sc > bestScore) { bestScore = sc; best = l; } });
  if (best && bestScore >= SIMILAR_MIN) return { label: best, isNew: false, how: "proche" };
  return { label: cleanCourseName(courseName) || "Nouvelle matière", isNew: true, how: "nouvelle" };
}

/* ---------- Identité, historique et décisions ----------
   Une note est reconnue par l'identifiant que Moodle donne à la ligne (« #123 »), à défaut par celui de l'activité,
   à défaut par son nom. L'identifiant enregistré d'une note (item.id) ne change jamais : « ref » porte le lien avec Moodle.
   Règle absolue : une note VALIDÉE garde sa valeur tant que l'utilisateur n'a pas accepté la nouvelle, et une note
   décidée n'est jamais supprimée automatiquement. */
const HISTORY_ITEM_MAX = 20;
function itemId(courseId, title) { return "MDL|" + courseId + "|" + String(title).toLowerCase().replace(/\s+/g, " ").trim(); }
function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
function refOf(g) { return g.gradeId ? "#" + g.gradeId : g.cmid ? "@" + g.cmid : ""; }
function sameValue(a, b) { return !!a && !!b && a.raw === b.raw && a.max === b.max; }
function remember(item, entry) { item.history = (item.history || []).concat(entry).slice(-HISTORY_ITEM_MAX); }

/* Associe chaque note lue à une note déjà connue : par identifiant Moodle d'abord, puis (anciennes données ou page sans
   identifiant) par nom, en préférant la même valeur : deux activités de même nom réordonnées gardent leurs décisions. */
function sameHost(x, host) { return !x.host || !host || x.host === host; }
function match(items, scraped, host) {
  const taken = new Set(), found = new Array(scraped.length).fill(null);
  // Les numéros de cours recommencent d'une année à l'autre : une note d'une autre adresse Moodle n'est jamais la même.
  const all = Object.values(items).filter((x) => sameHost(x, host));
  const take = (i, it) => { found[i] = it; taken.add(it.id); };
  scraped.forEach((g, i) => {
    const ref = refOf(g); if (!ref) return;
    const hit = all.find((x) => !taken.has(x.id) && x.courseId === g.courseId && x.ref === ref);
    if (hit) take(i, hit);
  });
  const compatible = (g, x) => !x.ref || !refOf(g) || x.ref[0] !== refOf(g)[0];
  [true, false].forEach((exact) => scraped.forEach((g, i) => {
    if (found[i]) return;
    const candidates = all.filter((x) => !taken.has(x.id) && x.courseId === g.courseId && norm(x.title) === norm(g.title) && compatible(g, x) && (!exact || sameValue(x, g)));
    if (candidates.length) take(i, candidates[0]);
  }));
  return found;
}

/* Compare les notes lues aux décisions déjà prises.
   scraped : [{ courseId, course, ...note de parseReport }].
   opts.read : { <cours lu en entier> : [identifiants de toutes ses lignes] } — seuls ces cours permettent de dire
   qu'une note a disparu. -> { store, fresh, firstRun, missing } ; fresh = notes nouvelles ou modifiées à examiner. */
function diff(store, scraped, releve, now, opts) {
  const firstRun = !store || !store.items;
  const items = Object.assign({}, firstRun ? {} : store.items);
  const fresh = [], missing = [], matched = new Set();
  const host = (opts && opts.host) || "";
  const found = match(items, scraped, host);
  const suggest = (g) => suggestMatiere(releve, g.course, g.title, store, g.courseId);
  const added = [];
  scraped.forEach((g, i) => {
    const old = found[i], ref = refOf(g);
    if (old) {
      matched.add(old.id);
      const it = Object.assign({}, old, { ref: ref || old.ref || "", course: g.course || old.course, feedback: g.feedback, type: g.type || old.type });
      delete it.missingSince; delete it.missingWhy;
      if (host) it.host = host;
      if (norm(old.title) !== norm(g.title)) { remember(it, { at: now, kind: "renommée", from: old.title, to: g.title }); it.title = g.title; }
      if (g.weight !== undefined) {
        if (old.weight !== undefined && old.weight !== g.weight) remember(it, { at: now, kind: "pondération", from: old.weight, to: g.weight });
        it.weight = g.weight;
      }
      if (g.category !== undefined) it.category = g.category;
      if (g.computed) it.computed = true;
      if (sameValue(old, g)) {
        delete it.change;
        // Proposition recalculée tant que la note attend (relevé ou matières créées ont pu changer) et n'a pas été retouchée.
        if (it.status === "pending" && (!it.matiere || !it.how || it.how === "defaut" || it.how === "mots")) {
          const sg = suggest(g); it.matiere = sg.label; it.isNew = sg.isNew; it.how = sg.how;
        }
      } else if (it.status === "validated") {
        // La moyenne ne bouge pas : la nouvelle valeur attend la confirmation de l'utilisateur.
        const next = { raw: g.raw, max: g.max, note20: g.note20, at: now };
        if (!sameValue(it.keptAgainst, next) && !sameValue(old.change, next)) {
          it.change = next; remember(it, { at: now, kind: "note", from: { raw: old.raw, max: old.max }, to: { raw: g.raw, max: g.max } });
          fresh.push(it);
        }
      } else {
        remember(it, { at: now, kind: "note", from: { raw: old.raw, max: old.max }, to: { raw: g.raw, max: g.max } });
        Object.assign(it, { raw: g.raw, max: g.max, note20: g.note20, status: "pending", decidedAt: null, at: now });
        delete it.change;
        fresh.push(it);
      }
      items[it.id] = it;
      return;
    }
    let id = itemId(g.courseId, g.title);
    for (let n = 2; items[id]; n++) id = itemId(g.courseId, g.title) + "|" + n;
    const sug = suggest(g);
    const rec = { id, ref, host, courseId: g.courseId, course: g.course, title: g.title, type: g.type, raw: g.raw, max: g.max, note20: g.note20,
      feedback: g.feedback, weight: g.weight === undefined ? null : g.weight, category: g.category || "", computed: !!g.computed,
      matiere: sug.label, isNew: !!sug.isNew, how: sug.how, coeff: 1, coeffConfirmed: false, status: "pending", at: now, decidedAt: null };
    items[id] = rec; matched.add(id); added.push(rec);
    if (!firstRun) fresh.push(rec);
  });
  // Notes disparues : seulement dans les cours lus en entier. Rien n'est supprimé.
  const read = (opts && opts.read) || {};
  // listed : tous les cours de la page « Notes », quand la liste a été lue en entier.
  const listed = opts && Array.isArray(opts.listed) && opts.listed.length ? new Set(opts.listed) : null;
  Object.values(items).forEach((old) => {
    if (matched.has(old.id) || !sameHost(old, host)) return;
    const courseRead = Object.prototype.hasOwnProperty.call(read, old.courseId);
    const courseGone = !!listed && !!old.host && old.host === host && !listed.has(old.courseId);
    if (!courseRead && !courseGone) return;
    if (!old.missingSince) {
      const it = Object.assign({}, old, { missingSince: now });
      const still = courseRead && (read[old.courseId] || []).some((r) => (old.ref && r.ref === old.ref) || (!old.ref && norm(r.title) === norm(old.title)));
      it.missingWhy = courseGone ? "son cours n'apparaît plus dans la page Notes" : still ? "la note a été retirée de Moodle" : "l'activité n'apparaît plus dans Moodle";
      remember(it, { at: now, kind: "disparue", why: it.missingWhy });
      items[it.id] = it; missing.push(it);
    }
  });
  // Doublon probable : une note nouvelle de même valeur qu'une note validée du même cours (renommée sans identifiant, recréée…).
  added.forEach((rec) => {
    const twin = Object.values(items).find((x) => x.id !== rec.id && x.courseId === rec.courseId && x.status === "validated" && sameValue(x, rec) && (x.missingSince || norm(x.title) === norm(rec.title)));
    if (twin) rec.dupOf = twin.id;
  });
  // Place limitée : seules des notes jamais décidées ET disparues peuvent être oubliées.
  let ids = Object.keys(items);
  if (ids.length > ITEM_MAX) {
    ids.filter((k) => items[k].missingSince && items[k].status === "pending").sort((a, b) => items[a].missingSince - items[b].missingSince)
      .slice(0, ids.length - ITEM_MAX).forEach((k) => delete items[k]);
  }
  return { store: { sync: new Date(now).toISOString(), items }, fresh, firstRun, missing };
}

/* Décision de l'utilisateur. opts : { matiere, coeff }. Renvoie un nouveau magasin (l'ancien est intact). */
function decide(store, id, status, opts, now) {
  // « deleted » : supprimée définitivement de la corbeille ; elle reste mémorisée (invisible) pour ne pas être redemandée à la synchro suivante.
  if (!store || !store.items || !store.items[id] || (status !== "validated" && status !== "refused" && status !== "pending" && status !== "deleted")) return store;
  const o = opts || {}, cur = store.items[id], next = Object.assign({}, cur, { status, decidedAt: status === "pending" ? null : now, updatedAt: now });
  if (o.matiere !== undefined) next.matiere = o.matiere ? String(o.matiere).slice(0, 120) : null;
  if (o.isNew !== undefined) next.isNew = !!o.isNew;
  const c = Number(o.coeff); if (Number.isFinite(c) && c > 0 && c <= 100) { next.coeff = c; if (status === "validated") next.coeffConfirmed = true; }
  // Sortie de « validée » avec une nouvelle valeur en attente : la note reprend la valeur actuelle de Moodle.
  if (status !== "validated" && next.change) { Object.assign(next, { raw: next.change.raw, max: next.change.max, note20: next.change.note20 }); delete next.change; }
  return Object.assign({}, store, { items: Object.assign({}, store.items, { [id]: next }) });
}

/* Valeur modifiée sur Moodle pour une note validée : l'accepter, ou garder l'ancienne (on ne redemandera que si Moodle change encore). */
function resolveChange(store, id, accept, now) {
  const cur = store && store.items && store.items[id];
  if (!cur || !cur.change) return store;
  const next = Object.assign({}, cur, { updatedAt: now });
  if (accept) { Object.assign(next, { raw: cur.change.raw, max: cur.change.max, note20: cur.change.note20 }); delete next.keptAgainst; }
  else next.keptAgainst = { raw: cur.change.raw, max: cur.change.max };
  remember(next, { at: now, kind: accept ? "nouvelle valeur acceptée" : "ancienne valeur gardée" });
  delete next.change;
  return Object.assign({}, store, { items: Object.assign({}, store.items, { [id]: next }) });
}

/* Import d'un lien ou d'un fichier : les deux appareils peuvent avoir des décisions. Pour chaque note, la décision la
   plus récente gagne ; une note sans décision ne remplace jamais une note décidée ; rien n'est supprimé. */
const STATUSES = ["pending", "validated", "refused", "deleted"];
/* Une note venue d'un lien ou d'un fichier n'est gardée que si elle a la forme attendue. */
function validItem(x) {
  return !!x && typeof x === "object" && typeof x.id === "string" && x.id.startsWith("MDL|") && x.id.length < 500 && typeof x.courseId === "string" &&
    typeof x.title === "string" && STATUSES.includes(x.status) && Number.isFinite(x.raw) && Number.isFinite(x.max) && x.max > 0 && Number.isFinite(x.note20) &&
    (x.history === undefined || Array.isArray(x.history));
}
function mergeStores(local, incoming) {
  if (!incoming || !incoming.items) return local || incoming || null;
  if (!local || !local.items) return incoming;
  const items = Object.assign({}, local.items);
  const stamp = (x) => Math.max(x.updatedAt || 0, x.decidedAt || 0);
  Object.values(incoming.items).filter(validItem).forEach((theirs) => {
    const same = (x) => x.courseId === theirs.courseId && sameHost(x, theirs.host);
    const key = items[theirs.id] && same(items[theirs.id]) ? theirs.id : Object.keys(items).find((k) => theirs.ref && same(items[k]) && items[k].ref === theirs.ref);
    if (!key) {
      let id = theirs.id; for (let n = 2; items[id]; n++) id = theirs.id + "|" + n;
      items[id] = Object.assign({}, theirs, { id }); return;
    }
    const mine = items[key];
    const newer = String(incoming.sync || "") > String(local.sync || "");
    const theirsWins = stamp(theirs) !== stamp(mine) ? stamp(theirs) > stamp(mine) : newer;
    items[key] = Object.assign({}, theirsWins ? theirs : mine, { id: key });
  });
  return { sync: String(incoming.sync || "") > String(local.sync || "") ? incoming.sync : local.sync, items };
}

function list(store, status) {
  return Object.values((store && store.items) || {}).filter((x) => x.status === status).sort((a, b) => (b.at || 0) - (a.at || 0));
}

/* Copie du relevé avec les notes validées en évaluations de leur matière. Le libellé finit par « (sur 20.0) » :
   la note est déjà ramenée sur 20, aucune question de barème. Une note validée sur une « nouvelle matière » crée cette
   matière dans une UE à part (« Matières ajoutées (Moodle) ») ; si Odin la publie plus tard, la note s'y rattache. */
const CUSTOM_UE = "Matières ajoutées (Moodle)";
function mergeReleve(releve, store) {
  if (!releve || !Array.isArray(releve.ue)) return releve;
  const validated = list(store, "validated").filter((x) => x.matiere);
  if (!validated.length) return releve;
  const asEval = (x) => ({ label: `${x.title} · Moodle (sur 20.0)`, key: x.id, coeff: x.coeff || 1, note: x.note20, moy: null, maxi: null, mini: null, moodle: true });
  const labels = new Set(matieres(releve).map((m) => m.label));
  const ue = releve.ue.map((u) => Object.assign({}, u, { matieres: (u.matieres || []).map((m) => {
    const mine = validated.filter((x) => x.matiere === m.label);
    if (!mine.length) return m;
    const have = new Set((m.evals || []).map((e) => e.key));
    const extra = mine.filter((x) => !have.has(x.id)).map(asEval);
    return Object.assign({}, m, { evals: (m.evals || []).concat(extra) }, extra.length ? { note: null } : {});
  }) }));
  const created = new Map();
  validated.filter((x) => !labels.has(x.matiere)).forEach((x) => { if (!created.has(x.matiere)) created.set(x.matiere, []); created.get(x.matiere).push(asEval(x)); });
  if (created.size) ue.push({ label: CUSTOM_UE, coeff: 1, note: null, matieres: [...created].map(([label, evals]) => ({ label, coeff: 1, note: null, evals })) });
  return Object.assign({}, releve, { ue });
}

/* La même note (sur 20) figure-t-elle déjà, venant d'Odin, dans cette matière ? Si oui, la valider la compterait deux fois. */
function sameAsOdin(releve, it) {
  if (!releve || !Array.isArray(releve.ue) || !it || !it.matiere) return null;
  const m = matieres(releve).find((x) => x.label === it.matiere);
  const raw = m && releve.ue.flatMap((u) => u.matieres || []).find((x) => x.label === it.matiere);
  const close = (x) => Math.abs(x - it.note20) < 0.01;
  // releve = relevé avec les barèmes choisis appliqués ; tant qu'un barème « sur N » n'est pas choisi, on compare aussi ramené sur 20.
  return ((raw && raw.evals) || []).find((e) => !e.moodle && typeof e.note === "number" &&
    (close(e.note) || (e.max && e.max !== 20 && e.choice == null && close(e.note * 20 / e.max)))) || null;
}

function fmt(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }

/* Texte de la notification : « Nouvelle note détectée sur Moodle : R1.07 · 19 / 20 — commentaire ». */
function describe(it) {
  const subject = it.matiere || it.course || "";
  const sur = it.max === 20 ? "20" : fmt(it.max);
  if (it.change) return { title: "Note modifiée sur Moodle", subject, line: `${subject} : ${it.title} — ${fmt(it.raw)} / ${sur} devient ${fmt(it.change.raw)} / ${fmt(it.change.max)}`, feedback: it.feedback || "" };
  return { title: `Nouvelle note détectée sur Moodle`, subject, line: `${subject} : ${it.title} — ${fmt(it.raw)} / ${sur}`, feedback: it.feedback || "" };
}

root.UCA_MOODLE = { parseOverview, parseReport, parseCourseGrades, resolveChange, mergeStores, codeOf, matieres, matchMatiere, suggestMatiere, similarity, cleanCourseName, customMatieres, CUSTOM_UE, itemId, diff, decide, list, mergeReleve, sameAsOdin, describe, fmt };
})(typeof self !== "undefined" ? self : globalThis);
