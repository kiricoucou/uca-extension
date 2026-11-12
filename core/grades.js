/* Calculs sur le relevé de notes, sans aucun accès à la page : moyennes, simulateur d'objectif,
   historique de la moyenne, séries pour le graphique. Chargé par l'agenda et par le service worker
   (l'historique s'enregistre à chaque synchro, agenda ouvert ou non).
   Format du relevé (voir parseNotesText dans background.js) :
   { ue: [{ label, coeff, note, matieres: [{ label, coeff, note, evals: [{ label, key, coeff, note, moy, maxi, mini }] }] }] }
   Les notes sont prises sur 20 (le relevé Odin donne « (sur 20.0) »). Une évaluation « (sur 12.0) » ou « (sur 25) » est
   ambiguë (la note affichée est-elle déjà ramenée sur 20 ?) : l'utilisateur choisit, évaluation par évaluation,
   (uca_scales : { "matière|évaluation": 20 | barème }) et applyScales() renvoie le relevé avec les notes ramenées sur 20. */
(function (root) {
"use strict";

const HISTORY_MAX = 300;

/* Moyenne pondérée des éléments qui ont une note et un coefficient ; null si aucun. */
function weightedAvg(items) {
  let sw = 0, sc = 0;
  items.forEach(({ note, coeff }) => { if (note == null || coeff == null) return; sw += note * coeff; sc += coeff; });
  return sc ? sw / sc : null;
}
// Odin ne remplit souvent la note de matière/UE qu'au jury de semestre : on la reconstruit depuis le
// niveau en dessous avec les coefficients du tableau (éval -> matière -> UE).
function matiereNote(m) { return m.note != null ? m.note : weightedAvg(m.evals || []); }
function ueNote(ue) { return ue.note != null ? ue.note : weightedAvg((ue.matieres || []).map((m) => ({ note: matiereNote(m), coeff: m.coeff }))); }
function generalAvg(releve) {
  if (!releve || !releve.ue || !releve.ue.length) return null;
  return weightedAvg(releve.ue.map((ue) => ({ note: ueNote(ue), coeff: ue.coeff })));
}

/* Évaluations à venir (sans note, avec coefficient) qui comptent vraiment : pas celles d'une matière
   ou d'une UE dont la note est déjà fixée par le jury. */
function pendingEvals(releve, scopeId) {
  const out = [], seen = new Set();
  ((releve && releve.ue) || []).forEach((ue) => {
    if (scopeId.startsWith("ue:") && scopeId.slice(3) !== ue.label) return;
    if (ue.note != null) return;
    (ue.matieres || []).forEach((m) => {
      if (scopeId.startsWith("mat:") && scopeId.slice(4) !== m.label) return;
      if (seen.has(m.label)) return; seen.add(m.label);
      if (m.note != null) return;
      (m.evals || []).forEach((e) => { if (e.note == null && e.coeff > 0) out.push(e); });
    });
  });
  return out;
}

/* Choix proposés dans le simulateur : la moyenne générale, puis chaque UE et chaque matière qui a
   encore au moins une évaluation à venir. */
function scopes(releve) {
  const list = [];
  if (pendingEvals(releve, "general").length) list.push({ id: "general", label: "Moyenne générale" });
  const seenMat = new Set();
  ((releve && releve.ue) || []).forEach((ue) => {
    if (pendingEvals(releve, "ue:" + ue.label).length) list.push({ id: "ue:" + ue.label, label: ue.label });
    (ue.matieres || []).forEach((m) => {
      if (seenMat.has(m.label)) return; seenMat.add(m.label);
      if (pendingEvals(releve, "mat:" + m.label).length) list.push({ id: "mat:" + m.label, label: m.label });
    });
  });
  return list;
}

function scopeValue(releve, scopeId) {
  if (scopeId === "general") return generalAvg(releve);
  if (scopeId.startsWith("ue:")) { const ue = releve.ue.find((u) => u.label === scopeId.slice(3)); return ue ? ueNote(ue) : null; }
  const label = scopeId.slice(4);
  for (const ue of releve.ue) { const m = (ue.matieres || []).find((x) => x.label === label); if (m) return matiereNote(m); }
  return null;
}

/* Valeur de la cible si toutes les évaluations à venir du périmètre valaient `x`. */
function valueIfAll(releve, scopeId, x) {
  const pending = new Set(pendingEvals(releve, scopeId));
  const filled = { ue: releve.ue.map((ue) => ({ ...ue, matieres: (ue.matieres || []).map((m) => ({ ...m, evals: (m.evals || []).map((e) => (pending.has(e) ? { ...e, note: x } : e)) })) })) };
  return scopeValue(filled, scopeId);
}

/* Quelle note faut-il sur les évaluations à venir pour atteindre `target` ?
   -> { status: "nothing" | "reached" | "impossible" | "needed", needed, current, max, pending, coeff }
   La même note est supposée à chaque évaluation à venir ; la valeur est monotone, d'où la dichotomie. */
function simulate(releve, scopeId, target) {
  const pending = pendingEvals(releve, scopeId);
  const base = { current: scopeValue(releve, scopeId), pending: pending.length, coeff: pending.reduce((s, e) => s + e.coeff, 0) };
  if (!pending.length) return { ...base, status: "nothing" };
  const at0 = valueIfAll(releve, scopeId, 0), at20 = valueIfAll(releve, scopeId, 20);
  if (at0 != null && at0 >= target) return { ...base, status: "reached", needed: 0 };
  if (at20 == null || at20 < target) return { ...base, status: "impossible", max: at20 };
  let lo = 0, hi = 20;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (valueIfAll(releve, scopeId, mid) >= target) hi = mid; else lo = mid; }
  let needed = Math.ceil(hi * 100) / 100;
  while (valueIfAll(releve, scopeId, needed) < target && needed < 20) needed = Math.round((needed + 0.01) * 100) / 100;
  return { ...base, status: "needed", needed: Math.min(20, needed) };
}

/* Projection du semestre : moyenne générale si toutes les évaluations à venir valaient x (x sur 20). */
function projection(releve, values) {
  if (!releve || !pendingEvals(releve, "general").length) return [];
  return values.map((x) => ({ x, avg: valueIfAll(releve, "general", x) })).filter((r) => r.avg != null);
}

/* Moyenne générale si les évaluations à venir d'une seule matière valaient x, les autres restant sans note. */
function generalIfFill(releve, matLabel, x) {
  const pending = new Set(pendingEvals(releve, "mat:" + matLabel));
  const filled = { ue: releve.ue.map((ue) => ({ ...ue, matieres: (ue.matieres || []).map((m) => ({ ...m, evals: (m.evals || []).map((e) => (pending.has(e) ? { ...e, note: x } : e)) })) })) };
  return generalAvg(filled);
}

/* Classement des matières à prioriser : celles dont les évaluations à venir peuvent le plus faire bouger la
   moyenne générale (levier = écart de moyenne générale entre 20 et 0 sur ces évaluations), avec la note à
   viser pour atteindre `target` dans la matière elle-même. Décroissant ; vide s'il ne reste rien à venir. */
function priorities(releve, target) {
  const out = [];
  scopes(releve).filter((sc) => sc.id.startsWith("mat:")).forEach((sc) => {
    const label = sc.id.slice(4), hi = generalIfFill(releve, label, 20), lo = generalIfFill(releve, label, 0);
    if (hi == null || lo == null) return;
    const sim = simulate(releve, sc.id, target);
    out.push({ label, pending: sim.pending, coeff: sim.coeff, lever: hi - lo, status: sim.status, needed: sim.needed == null ? null : sim.needed, max: sim.max == null ? null : sim.max, current: sim.current });
  });
  return out.sort((a, b) => b.lever - a.lever || a.label.localeCompare(b.label, "fr"));
}

/* Historique de la moyenne générale : un point seulement quand elle change. Renvoie la nouvelle liste,
   ou null s'il n'y a rien à ajouter. */
function nextHistory(history, releve, now) {
  const avg = generalAvg(releve);
  if (avg == null) return null;
  const rounded = Math.round(avg * 100) / 100, list = history || [];
  if (list.length && list[list.length - 1].avg === rounded) return null;
  return list.concat({ at: now, avg: rounded }).slice(-HISTORY_MAX);
}

/* Séries du graphique d'une matière : une barre par évaluation notée (note, moyenne de la classe). */
function matiereSeries(releve, label) {
  for (const ue of (releve && releve.ue) || []) {
    const m = (ue.matieres || []).find((x) => x.label === label);
    if (m) return (m.evals || []).filter((e) => e.note != null).map((e) => ({ label: e.label.replace(/\s*\(sur[^)]*\)/i, ""), note: e.note, moy: e.moy == null ? null : e.moy }));
  }
  return [];
}
function gradedMatieres(releve) {
  const out = [], seen = new Set();
  ((releve && releve.ue) || []).forEach((ue) => (ue.matieres || []).forEach((m) => {
    if (seen.has(m.label)) return; seen.add(m.label);
    if ((m.evals || []).some((e) => e.note != null)) out.push(m.label);
  }));
  return out;
}

/* Barème écrit dans l'intitulé : « QCM1 (sur 12.0) » -> 12 ; null si absent. */
function maxOf(label) {
  const m = /\(\s*sur\s*(\d+(?:[.,]\d+)?)\s*\)/i.exec(String(label || ""));
  const n = m ? parseFloat(m[1].replace(",", ".")) : NaN;
  return n > 0 && Number.isFinite(n) ? n : null;
}
/* Clé d'une évaluation dans uca_scales (la même que celle des notes vues). */
function scaleKey(matLabel, ev) { return matLabel + "|" + (ev.key || ev.label); }

/* Copie du relevé où chaque évaluation dont l'utilisateur a choisi un barème autre que 20 est ramenée sur 20
   (note, moyenne, maxi, mini : × 20 / barème). Ajoute à chaque évaluation : max (barème de l'intitulé, ou null),
   choice (20, le barème, ou null si pas encore choisi), rawNote (note telle qu'écrite par Odin) et scaled.
   Les notes de matière et d'UE fixées par Odin ne sont pas gardées quand une de leurs évaluations est ramenée :
   elles sont recalculées avec les coefficients, pour que la moyenne suive le choix. Sans choix : relevé inchangé. */
function applyScales(releve, scales) {
  if (!releve || !Array.isArray(releve.ue)) return releve;
  const sc = scales && typeof scales === "object" ? scales : {};
  return Object.assign({}, releve, { ue: releve.ue.map((ue) => {
    let ueScaled = false;
    const matieres = (ue.matieres || []).map((m) => {
      let matScaled = false;
      const evals = (m.evals || []).map((e) => {
        const max = maxOf(e.label), out = Object.assign({}, e, { max, choice: null, rawNote: e.note, scaled: false });
        if (!max || max === 20) return out;
        const c = Number(sc[scaleKey(m.label, e)]);
        if (c === 20 || c === max) out.choice = c;
        if (out.choice === max && e.note != null) {
          const k = 20 / max;
          ["note", "moy", "maxi", "mini"].forEach((f) => { if (e[f] != null) out[f] = e[f] * k; });
          out.scaled = true; matScaled = true;
        }
        return out;
      });
      if (matScaled) ueScaled = true;
      return Object.assign({}, m, { evals }, matScaled ? { note: null } : {});
    });
    return Object.assign({}, ue, { matieres }, ueScaled ? { note: null } : {});
  }) });
}


/* Compétences (UE) : « UE RT 1.1 - Assister l'administrateur du réseau » = département RT, semestre 1, compétence 1.
   Il faut 10/20 de moyenne à chaque UE ; la note d'une UE est celle d'Odin ou, à défaut, la moyenne pondérée de ses
   matières. Regroupées par année (BUT 1 = semestres 1 et 2...), avec la moyenne de chaque année et de chaque
   compétence sur l'année. */
const UE_RE = /^\s*UE\s+(?:([A-Za-zÀ-ÿ]+)\s+)?(\d+)\.(\d+)\s*[-–—:]?\s*(.*)$/;
function mean(list) { const v = list.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function competences(releve) {
  const items = [], seen = new Set();
  ((releve && releve.ue) || []).forEach((ue) => {
    const m = UE_RE.exec(ue.label || ""); if (!m || seen.has(ue.label)) return; seen.add(ue.label);
    const sem = +m[2], idx = +m[3];
    items.push({ label: ue.label, dept: m[1], sem, idx, year: Math.ceil(sem / 2), title: m[4].trim(), short: `${m[1] ? m[1] + " " : ""}${sem}.${idx}`, note: ueNote(ue) });
  });
  items.sort((a, b) => a.sem - b.sem || a.idx - b.idx);
  const years = [...new Set(items.map((i) => i.year))].sort((a, b) => a - b).map((year) => {
    const ues = items.filter((i) => i.year === year);
    const sems = [...new Set(ues.map((i) => i.sem))].map((sem) => ({ sem, ues: ues.filter((i) => i.sem === sem), avg: mean(ues.filter((i) => i.sem === sem).map((i) => i.note)) }));
    const comps = [...new Set(ues.map((i) => i.idx))].sort((a, b) => a - b).map((idx) => ({ idx, avg: mean(ues.filter((i) => i.idx === idx).map((i) => i.note)), count: ues.filter((i) => i.idx === idx && i.note != null).length }));
    return { year, ues, sems, comps, avg: mean(ues.map((i) => i.note)) };
  });
  return { years, items };
}

root.UCA_GRADES = { competences, maxOf, scaleKey, applyScales, weightedAvg, matiereNote, ueNote, generalAvg, pendingEvals, scopes, simulate, projection, priorities, nextHistory, matiereSeries, gradedMatieres };
})(self);
