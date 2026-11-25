/* Notes Moodle : lecture des pages de notes, détection des nouvelles notes et fusion (après validation de
   l'utilisateur) dans le relevé Odin. Aucun accès réseau ici : fonctions pures, chargées par le service worker,
   l'agenda et les tests.

   Rien n'entre dans les moyennes sans accord : une note vue sur Moodle est « pending » ; l'utilisateur la
   valide (elle rejoint le tableau des notes) ou la refuse (ignorée pour toujours, tant que sa valeur ne change
   pas : des contrôles fictifs existent sur Moodle).

   Magasin (uca_moodle) :
   { sync: ISO, items: { "MDL|<cours>|<activité>": { id, courseId, course, title, type, raw, max, note20,
     feedback, matiere, coeff, status: "pending" | "validated" | "refused" (= dans la corbeille) | "deleted", at, decidedAt } } } */
(function (root) {
"use strict";

const ITEM_MAX = 400;

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
  return { userId, courses };
}

/* Rapport de notes d'un cours (table.user-grade) : une entrée par activité notée. Ignore catégories, totaux,
   activités sans note (« - ») et lignes illisibles. Note sur 20 = note / barème × 20. */
function parseCourseGrades(html) {
  const out = [];
  const tm = /<table\b[^>]*user-grade[^>]*>([\s\S]*?)<\/table>/i.exec(html || "");
  if (!tm) return out;
  const rows = tm[1].split(/<tr\b/i).slice(1);
  rows.forEach((row) => {
    const th = /<th\b[^>]*column-itemname[^>]*>([\s\S]*?)<\/th>/i.exec(row);
    if (!th) return;
    const typeM = /text-uppercase[^>]*>([\s\S]*?)<\/span>/i.exec(th[1]);
    const titleM = /class="[^"]*rowtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(th[1]);
    const type = typeM ? text(typeM[1]) : "";
    const title = titleM ? text(titleM[1]) : "";
    if (!title || /tendance centrale|total du cours|^total\b/i.test(type + " " + title)) return;
    const cell = (cls) => { const c = new RegExp("<td\\b[^>]*" + cls + "[^>]*>([\\s\\S]*?)</td>", "i").exec(row); return c ? text(c[1]) : ""; };
    const gradeTxt = cell("column-grade").replace(/\bActions\b/gi, "").trim();
    const rangeTxt = cell("column-range");
    const raw = num(gradeTxt);
    if (raw === null || /^[-–—\s]*$/.test(gradeTxt)) return;
    const nums = (rangeTxt.match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
    const max = nums.length >= 2 ? nums[1] : null;
    let value = raw, scale = max;
    if (/%/.test(gradeTxt) && max) value = raw / 100 * max;
    if (!scale || scale <= 0) return;
    out.push({ title, type, raw: value, max: scale, note20: round3(value / scale * 20), feedback: cell("column-feedback") });
  });
  return out;
}

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
function suggestMatiere(releve, courseName, title, store) {
  const known = matieres(releve).map((m) => m.label);
  const extra = customMatieres(store).filter((l) => !known.includes(l));
  const names = known.concat(extra);
  const code = codeOf(courseName) || codeOf(title);
  if (code) { const hit = names.find((l) => codeOf(l) === code); if (hit) return { label: hit, isNew: false, how: "code" }; }
  let best = null, bestScore = 0;
  names.forEach((l) => { const sc = Math.max(similarity(courseName, l), similarity(title, l) * 0.8); if (sc > bestScore) { bestScore = sc; best = l; } });
  if (best && bestScore >= SIMILAR_MIN) return { label: best, isNew: false, how: "proche" };
  return { label: cleanCourseName(courseName) || "Nouvelle matière", isNew: true, how: "nouvelle" };
}

function itemId(courseId, title) { return "MDL|" + courseId + "|" + String(title).toLowerCase().replace(/\s+/g, " ").trim(); }

/* Compare les notes lues aux décisions déjà prises. Nouvelle note, ou valeur changée -> « pending ».
   Notes validées/refusées inchangées -> intactes. Au tout premier passage (aucun magasin), tout est « pending »
   sans être « fresh » : l'appelant ne notifie qu'une fois (firstRun).
   scraped : [{ courseId, course, ...parseCourseGrades }] ; renvoie { store, fresh, firstRun }. */
function diff(store, scraped, releve, now) {
  const firstRun = !store || !store.items;
  const items = Object.assign({}, firstRun ? {} : store.items);
  const fresh = [];
  scraped.forEach((g) => {
    const id = itemId(g.courseId, g.title), old = items[id];
    if (old && old.raw === g.raw && old.max === g.max) {
      // Même note : on rafraîchit seulement les champs informatifs (commentaire, rattachement non choisi).
      items[id] = Object.assign({}, old, { feedback: g.feedback, type: g.type || old.type });
      // Proposition recalculée tant que la note attend (relevé ou matières créées ont pu changer) et n'a pas été retouchée.
      if (old.status === "pending" && (!old.matiere || !old.how || old.how === "defaut" || old.how === "mots")) {
        const sg = suggestMatiere(releve, g.course, g.title, store); items[id].matiere = sg.label; items[id].isNew = sg.isNew; items[id].how = sg.how;
      }
      return;
    }
    const sug = old && old.matiere ? { label: old.matiere, isNew: !!old.isNew, how: old.how || null } : suggestMatiere(releve, g.course, g.title, store);
    const rec = { id, courseId: g.courseId, course: g.course, title: g.title, type: g.type, raw: g.raw, max: g.max, note20: g.note20,
      feedback: g.feedback, matiere: sug.label, isNew: !!sug.isNew, how: sug.how, coeff: (old && old.coeff) || 1,
      status: "pending", at: now, decidedAt: null };
    items[id] = rec;
    if (!firstRun) fresh.push(rec);
  });
  const ids = Object.keys(items);
  if (ids.length > ITEM_MAX) ids.sort((a, b) => (items[a].at || 0) - (items[b].at || 0)).slice(0, ids.length - ITEM_MAX).forEach((k) => delete items[k]);
  return { store: { sync: new Date(now).toISOString(), items }, fresh, firstRun };
}

/* Décision de l'utilisateur. opts : { matiere, coeff }. Renvoie un nouveau magasin (l'ancien est intact). */
function decide(store, id, status, opts, now) {
  // « deleted » : supprimée définitivement de la corbeille ; elle reste mémorisée (invisible) pour ne pas être redemandée à la synchro suivante.
  if (!store || !store.items || !store.items[id] || (status !== "validated" && status !== "refused" && status !== "pending" && status !== "deleted")) return store;
  const o = opts || {}, cur = store.items[id], next = Object.assign({}, cur, { status, decidedAt: status === "pending" ? null : now });
  if (o.matiere !== undefined) next.matiere = o.matiere ? String(o.matiere).slice(0, 120) : null;
  if (o.isNew !== undefined) next.isNew = !!o.isNew;
  const c = Number(o.coeff); if (Number.isFinite(c) && c > 0 && c <= 100) next.coeff = c;
  return Object.assign({}, store, { items: Object.assign({}, store.items, { [id]: next }) });
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

function fmt(n) { return String(Math.round(n * 100) / 100).replace(".", ","); }

/* Texte de la notification : « Nouvelle note détectée sur Moodle : R1.07 · 19 / 20 — commentaire ». */
function describe(it) {
  const subject = it.matiere || it.course || "";
  const sur = it.max === 20 ? "20" : fmt(it.max);
  return { title: `Nouvelle note détectée sur Moodle`, subject, line: `${subject} : ${it.title} — ${fmt(it.raw)} / ${sur}`, feedback: it.feedback || "" };
}

root.UCA_MOODLE = { parseOverview, parseCourseGrades, codeOf, matieres, matchMatiere, suggestMatiere, similarity, cleanCourseName, customMatieres, CUSTOM_UE, itemId, diff, decide, list, mergeReleve, describe, fmt };
})(typeof self !== "undefined" ? self : globalThis);
