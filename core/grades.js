/* Calculs sur le relevé de notes, sans aucun accès à la page : moyennes, simulateur d'objectif,
   historique de la moyenne, séries pour le graphique. Chargé par l'agenda et par le service worker
   (l'historique s'enregistre à chaque synchro, agenda ouvert ou non).
   Format du relevé (voir parseNotesText dans background.js) :
   { ue: [{ label, coeff, note, matieres: [{ label, coeff, note, evals: [{ label, key, coeff, note, moy, maxi, mini }] }] }] }
   Les notes sont prises sur 20 (le relevé Odin donne « (sur 20.0) »). */
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

root.UCA_GRADES = { weightedAvg, matiereNote, ueNote, generalAvg, pendingEvals, scopes, simulate, projection, priorities, nextHistory, matiereSeries, gradedMatieres };
})(self);
