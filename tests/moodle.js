// Tests de core/moodle.js (fonctions pures) : node tests/moodle.js — voir tests/moodle.py
const fs = require("fs"), path = require("path");
require(path.join(__dirname, "..", "core", "moodle.js"));
const M = globalThis.UCA_MOODLE;
const read = (f) => fs.readFileSync(path.join(__dirname, "pages", f), "utf8");
let fails = 0;
const check = (name, ok, detail) => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? " — " + JSON.stringify(detail) : "")); };

const ov = M.parseOverview(read("moodle_overview.html"));
check("overview : 3 cours, doublon ignoré", ov.courses.length === 3, ov.courses);
check("overview : id utilisateur", ov.userId === "900", ov.userId);
check("overview : paramètres dans n'importe quel ordre", ov.courses[1].id === "2222" && ov.courses[1].name === "Maths 1: outils pour le signal", ov.courses[1]);
check("overview : entités décodées (R&T1, apostrophe)", /R&T1/.test(ov.courses[0].name) && /S'initier/.test(ov.courses[2].name), ov.courses.map((c) => c.name));

const g = M.parseCourseGrades(read("moodle_cours.html"));
check("cours : 3 notes (sans catégorie, total ni « - »)", g.length === 3, g.map((x) => x.title));
check("cours : 19,000 / 20", g[0].title === "Résultats évaluation 1" && g[0].raw === 19 && g[0].max === 20 && g[0].note20 === 19 && g[0].type === "Devoir", g[0]);
check("cours : commentaire lu", /bonne maîtrise/.test(g[0].feedback), g[0].feedback);
check("cours : 6,5 / 10 ramené sur 20 (menu Actions ignoré)", g[1].raw === 6.5 && g[1].max === 10 && g[1].note20 === 13, g[1]);
check("cours : pourcentage 85 % sur 100 -> 17 / 20", g[2].raw === 85 && g[2].max === 100 && g[2].note20 === 17, g[2]);
check("cours : page sans tableau -> aucune note", M.parseCourseGrades("<html>Connexion</html>").length === 0);

check("code : R107 -> R1.07", M.codeOf("R107 - Fondamentaux") === "R1.07");
check("code : SAE12 -> SAE1.02, SAE1.05 -> SAE1.05", M.codeOf("SAE12 - réseaux") === "SAE1.02" && M.codeOf("Système-1 / SAE1.05") === "SAE1.05");
check("code : R1.03 -> R1.03", M.codeOf("R1.03 : Maths") === "R1.03");

const ev = (label) => ({ label, key: label, coeff: 1, note: null, moy: null, maxi: null, mini: null });
const releve = { ue: [{ label: "UE 1.1", coeff: 1, note: null, matieres: [
  { label: "R1.07 : Programmation", coeff: 1, note: null, evals: [ev("DS (sur 20.0)")] },
  { label: "R1.03 : Mathématiques du signal", coeff: 1, note: null, evals: [ev("QCM (sur 20.0)")] }] }] };
check("rattachement par code", M.matchMatiere(releve, "R107 - Fondamentaux", "x") === "R1.07 : Programmation");
check("rattachement par mots (sans code)", M.matchMatiere(releve, "Maths 1: outils pour le signal", "x") === "R1.03 : Mathématiques du signal", M.matchMatiere(releve, "Maths 1: outils pour le signal", "x"));
check("rattachement impossible -> null", M.matchMatiere(releve, "Soutien en anglais", "x") === null);
const sg = (c) => M.suggestMatiere(releve, c, "x");
check("proposition : par code", sg("R107 - Fondamentaux").label === "R1.07 : Programmation" && sg("R107 - Fondamentaux").how === "code");
check("proposition : matière la plus proche par le nom du cours", sg("Maths 1: outils pour le signal").label === "R1.03 : Mathématiques du signal" && sg("Maths 1: outils pour le signal").how === "proche" && !sg("Maths 1: outils pour le signal").isNew, sg("Maths 1: outils pour le signal"));
check("proposition : cours qui ne ressemble à rien -> créer une nouvelle matière (nom proposé)", sg("Soutien en anglais").isNew === true && sg("Soutien en anglais").how === "nouvelle" && sg("Soutien en anglais").label === "Soutien en anglais", sg("Soutien en anglais"));
check("proposition : code absent du relevé -> nouvelle matière avec le code dans le nom", M.suggestMatiere(releve, "SAE12 - S'initier aux réseaux (S1)", "x").label === "SAE1.02 : S'initier aux réseaux" && M.suggestMatiere(releve, "SAE12 - S'initier aux réseaux (S1)", "x").isNew);
check("proposition : relevé vide -> nouvelle matière", M.suggestMatiere({ ue: [] }, "R107 - Programmation", "x").isNew === true && M.suggestMatiere(null, "RSE - Accueil", "x").label === "RSE - Accueil");
check("ressemblance : maths ~ mathématiques, sans rapport = 0", M.similarity("Maths 1", "R1.03 : Mathématiques du signal") === 1 && M.similarity("Soutien en anglais", "R1.03 : Mathématiques du signal") === 0);
check("nom proposé : code normalisé, parenthèses retirées", M.cleanCourseName("R107 - Fondamentaux de la programmation (R&T1)") === "R1.07 : Fondamentaux de la programmation" && M.cleanCourseName("Soutien en programmation") === "Soutien en programmation");

const scraped = [{ courseId: "1111", course: "R107 - Fondamentaux", ...g[0] }, { courseId: "2222", course: "Maths 1: outils pour le signal", ...g[1] }];
const d = M.diff(null, scraped, releve, 1000);
check("premier passage : tout en attente, rien de « frais »", d.firstRun && d.fresh.length === 0 && M.list(d.store, "pending").length === 2);
const idA = M.itemId("1111", "Résultats évaluation 1");
check("rattachement auto sur le premier passage", d.store.items[idA].matiere === "R1.07 : Programmation");
const store = d.store;

const s2 = M.decide(store, idA, "validated", { coeff: 2 }, 2000);
check("validation : état et coefficient", s2.items[idA].status === "validated" && s2.items[idA].coeff === 2 && store.items[idA].status === "pending");
const merged = M.mergeReleve(releve, s2);
const mat = merged.ue[0].matieres[0];
check("fusion : évaluation ajoutée, sur 20, coeff 2, marquée Moodle", mat.evals.length === 2 && mat.evals[1].note === 19 && mat.evals[1].coeff === 2 && mat.evals[1].moodle === true && /\(sur 20\.0\)$/.test(mat.evals[1].label), mat.evals);
check("fusion : relevé d'origine intact", releve.ue[0].matieres[0].evals.length === 1);

const s3 = M.decide(store, idA, "refused", {}, 2000);
check("refus : rien dans le relevé", M.mergeReleve(releve, s3).ue[0].matieres[0].evals.length === 1);
const again = M.diff(s3, scraped, releve, 3000);
check("refus : jamais redemandée tant que la valeur ne change pas", again.fresh.length === 0 && again.store.items[idA].status === "refused");
const changed = M.diff(s3, [Object.assign({}, scraped[0], { raw: 12, note20: 12 })], releve, 4000);
check("valeur changée : redemandée", changed.fresh.length === 1 && changed.store.items[idA].status === "pending" && changed.store.items[idA].raw === 12);
const added = M.diff(s2, scraped.concat([{ courseId: "3333", course: "SAE12", title: "Rendu", type: "Devoir", raw: 14, max: 20, note20: 14, feedback: "" }]), releve, 5000);
check("nouvelle note : seule celle-ci est fraîche, la validée reste validée", added.fresh.length === 1 && added.fresh[0].title === "Rendu" && added.store.items[idA].status === "validated");
const txt = M.describe(added.fresh[0]);
check("texte de notification", /Rendu — 14 \/ 20/.test(txt.line) && txt.title === "Nouvelle note détectée sur Moodle", txt);
check("décision inconnue ignorée", M.decide(store, "MDL|0|x", "validated", {}, 1) === store && M.decide(store, idA, "autre", {}, 1) === store);
const dflt = M.diff(null, [{ courseId: "9", course: "Soutien en anglais", ...g[0] }], releve, 1).store;
const idD = M.itemId("9", "Résultats évaluation 1");
check("note sans correspondance : création d'une nouvelle matière recommandée, pas encore dans le relevé", dflt.items[idD].isNew === true && dflt.items[idD].matiere === "Soutien en anglais" && dflt.items[idD].how === "nouvelle" && M.mergeReleve(releve, dflt).ue.length === 1);
const created = M.decide(dflt, idD, "validated", { coeff: 2 }, 2);
const cr = M.mergeReleve(releve, created);
const cue = cr.ue[cr.ue.length - 1];
check("nouvelle matière validée : créée dans une UE « Matières ajoutées (Moodle) » avec sa note", cr.ue.length === 2 && cue.label === M.CUSTOM_UE && cue.matieres[0].label === "Soutien en anglais" && cue.matieres[0].evals[0].note === 19 && cue.matieres[0].evals[0].coeff === 2, cue);
check("matières créées : proposées pour les notes suivantes", M.customMatieres(created).join() === "Soutien en anglais" && M.suggestMatiere(releve, "Soutien en anglais 2", "x", created).label === "Soutien en anglais" && M.suggestMatiere(releve, "Soutien en anglais 2", "x", created).isNew === false);
const renamed = M.decide(created, idD, "validated", { matiere: "Anglais S1", isNew: true }, 2);
check("nouvelle matière renommable", M.mergeReleve(releve, renamed).ue[1].matieres[0].label === "Anglais S1");
const fixed = M.decide(dflt, idD, "validated", { matiere: "R1.03 : Mathématiques du signal", isNew: false, coeff: 3 }, 2);
const mm = M.mergeReleve(releve, fixed).ue[0].matieres;
check("l'utilisateur corrige la matière et le coefficient avant l'ajout", mm[1].evals.length === 2 && mm[1].evals[1].coeff === 3 && mm[0].evals.length === 1, mm.map((m) => m.evals.length));
// Notes déjà traitées : toujours modifiables (matière, coefficient, validation / refus à nouveau).
const e1 = M.decide(fixed, idD, "validated", { matiere: "R1.07 : Programmation", coeff: 2 }, 3);
const em1 = M.mergeReleve(releve, e1).ue[0].matieres;
check("modification d'une note validée : nouvelle matière et nouveau coefficient pris en compte", e1.items[idD].matiere === "R1.07 : Programmation" && e1.items[idD].coeff === 2 && em1[0].evals.length === 2 && em1[1].evals.length === 1 && em1[0].evals[1].coeff === 2, em1.map((m) => m.evals.length));
const e2 = M.decide(e1, idD, "refused", {}, 4);
check("validée puis ignorée : retirée du relevé, réglages gardés", M.mergeReleve(releve, e2).ue[0].matieres.every((m) => m.evals.length === 1) && e2.items[idD].matiere === "R1.07 : Programmation" && e2.items[idD].coeff === 2);
const e3 = M.decide(e2, idD, "validated", { coeff: 5 }, 5);
check("ignorée puis revalidée : revient dans le relevé avec le nouveau coefficient", M.mergeReleve(releve, e3).ue[0].matieres[0].evals[1].coeff === 5);
const e4 = M.decide(e3, idD, "pending", {}, 6);
check("remise en attente : plus dans le relevé", M.mergeReleve(releve, e4).ue[0].matieres.every((m) => m.evals.length === 1) && M.list(e4, "pending").length === 1);
const rescan = M.diff(e3, [{ courseId: "9", course: "Soutien en anglais", ...g[0] }], releve, 7);
check("synchro suivante : la décision modifiée n'est pas écrasée", rescan.store.items[idD].status === "validated" && rescan.store.items[idD].coeff === 5 && rescan.fresh.length === 0);
// Corbeille : refusée = dans la corbeille ; supprimée définitivement ("deleted") = invisible mais jamais redemandée.
const tr1 = M.decide(store, idA, "refused", {}, 10);
check("corbeille : note refusée listée dans la corbeille (refused), pas en attente ni validée", M.list(tr1, "refused").length === 1 && M.list(tr1, "pending").every((x) => x.id !== idA) && M.list(tr1, "validated").length === 0);
const tr2 = M.decide(tr1, idA, "deleted", {}, 11);
check("corbeille : supprimée définitivement -> statut deleted, hors corbeille", tr2.items[idA].status === "deleted" && M.list(tr2, "refused").length === 0 && M.list(tr2, "pending").every((x) => x.id !== idA));
const tr3 = M.diff(tr2, scraped, releve, 12);
check("corbeille : une note supprimée n'est jamais redemandée à la synchro suivante", tr3.store.items[idA].status === "deleted" && tr3.fresh.length === 0 && M.mergeReleve(releve, tr3).ue[0].matieres.every((m) => m.evals.length === 1));
const tr4 = M.diff(tr2, [Object.assign({}, scraped[0], { raw: 11, note20: 11 })], releve, 13);
check("corbeille : note supprimée dont la valeur change sur Moodle -> redemandée", tr4.fresh.length === 1 && tr4.store.items[idA].status === "pending");
const tr5 = M.decide(tr1, idA, "pending", {}, 14);
check("corbeille : restaurer = remettre en attente, réglages conservés", tr5.items[idA].status === "pending" && tr5.items[idA].matiere === store.items[idA].matiere);
const noMat = M.decide(M.diff(null, [{ courseId: "9", course: "Soutien en anglais", ...g[0] }], { ue: [] }, 1).store, idD, "validated", {}, 2);
check("validée sans matière (relevé vide) : ignorée par la fusion", M.mergeReleve(releve, noMat).ue[0].matieres.every((m) => m.evals.length === 1));
// la même note déjà venue d'Odin dans la matière : signalée avant validation (sinon comptée deux fois)
const odin = { ue: [{ label: "UE 1.1", coeff: 1, matieres: [{ label: "R1.07 : Programmation", coeff: 1, evals: [{ label: "DS (sur 20.0)", key: "k1", coeff: 1, note: 19 }] }, { label: "R1.03 : Maths", coeff: 1, evals: [] }] }] };
check("doublon : même note dans la même matière -> signalée", (M.sameAsOdin(odin, { matiere: "R1.07 : Programmation", note20: 19 }) || {}).label === "DS (sur 20.0)");
check("doublon : autre note, autre matière, matière nouvelle ou relevé vide -> rien", !M.sameAsOdin(odin, { matiere: "R1.07 : Programmation", note20: 12 }) && !M.sameAsOdin(odin, { matiere: "R1.03 : Maths", note20: 19 }) && !M.sameAsOdin(odin, { matiere: "Inconnue", note20: 19 }) && !M.sameAsOdin(null, { matiere: "x", note20: 1 }));
const twins = [{ courseId: "7", course: "Cours", title: "Contrôle", type: "Test", raw: 12, max: 20, note20: 12, feedback: "" }, { courseId: "7", course: "Cours", title: "Contrôle", type: "Test", raw: 15, max: 20, note20: 15, feedback: "" }];
const t1 = M.diff(null, twins, { ue: [] }, 1).store;
const t1ids = Object.keys(t1.items);
const t2 = M.diff(M.decide(t1, t1ids[0], "validated", {}, 2), twins, { ue: [] }, 3);
check("homonymes d'un même cours : deux notes distinctes, décisions conservées, rien de « nouveau » à la recherche suivante", t1ids.length === 2 && t2.fresh.length === 0 && t2.store.items[t1ids[0]].status === "validated" && t2.store.items[t1ids[1]].status === "pending", [t1ids, t2.fresh.length]);
process.exit(fails ? 1 : 0);
