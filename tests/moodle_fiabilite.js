// Fiabilité des notes Moodle (core/moodle.js) : node tests/moodle_fiabilite.js
// Pages fabriquées ; la structure réelle (anonymisée) est dans pages/moodle_cours_reel.html.
const fs = require("fs"), path = require("path");
require(path.join(__dirname, "..", "core", "moodle.js"));
const M = globalThis.UCA_MOODLE;
let fails = 0, total = 0;
const check = (name, ok, detail) => { total++; if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? " — " + JSON.stringify(detail) : "")); };

const row = (title, grade, range, o = {}) => `<tr><th class="level2 item column-itemname"${o.gid ? ` id="row_${o.gid}_9"` : ""}><div><span class="d-block text-uppercase small">Test</span><div class="rowtitle">${o.link ? `<a class="gradeitemheader" href="https://m/mod/${o.link.replace(":", "/view.php?id=")}">${title}</a>` : `<span class="gradeitemheader">${title}</span>`}</div></div></th>` +
  `<td class="column-weight">${o.weight || "-"}</td><td class="column-grade">${grade}</td><td class="column-range">${range}</td><td class="column-feedback">${o.fb || ""}</td></tr>`;
const totalRow = `<tr><th class="level1 baggt column-itemname"><div class="rowtitle"><span class="gradeitemheader">Total du cours</span></div></th><td class="column-grade">12</td><td class="column-range">0–100</td></tr>`;
const page = (rows, course = "1") => `<body id="page-course-user" class="path-course course-${course}"><table class="generaltable user-grade"><thead><tr><th class="column-itemname">Élément d’évaluation</th><th class="column-weight">Pondération calculée</th><th class="column-grade">Note</th><th class="column-range">Valeurs possibles</th><th class="column-feedback">Feedback</th></tr></thead><tbody>${rows.join("")}${totalRow}</tbody></table></body>`;
const read = (rows) => M.parseReport(page(rows), "1");
const scan = (rows) => read(rows).grades.map((g) => Object.assign({ courseId: "1", course: "R1.01 Cours" }, g));
const releve = { ue: [{ label: "UE 1.1", coeff: 1, matieres: [{ label: "R1.01 : Cours", coeff: 1, evals: [] }, { label: "R1.02 : Autre", coeff: 1, evals: [] }] }] };
const step = (store, rows, now) => M.diff(store, scan(rows), releve, now, { read: { 1: read(rows).rows } });
const only = (s) => Object.values(s.items)[0];

// ---- structure réelle (anonymisée)
const real = M.parseReport(fs.readFileSync(path.join(__dirname, "pages", "moodle_cours_reel.html"), "utf8"), "1500");
check("structure réelle : page reconnue par les classes", real.ok && real.strategy === "classes", [real.reason, real.strategy]);
check("structure réelle : 1 note, menu « Actions » ignoré", real.grades.length === 1 && real.grades[0].raw === 15.5 && real.grades[0].max === 20, real.grades);
check("structure réelle : identifiants de la note et de l'activité", !!real.grades[0] && real.grades[0].gradeId === "1002" && real.grades[0].cmid === "quiz:1003", real.grades[0]);
check("structure réelle : pondération lue, séparée du coefficient", !!real.grades[0] && real.grades[0].weight === 40 && real.grades[0].coeff === undefined);
check("structure réelle : note textuelle signalée sans être une anomalie", real.ignored.length === 1 && real.anomalies.length === 0, [real.ignored, real.anomalies]);
check("structure réelle : les 3 activités sont vues (total et catégorie exclus)", real.rows.length === 3, real.rows);

// ---- une page mal chargée n'est jamais « aucune note »
check("page d'erreur en HTTP 200 -> illisible", !M.parseReport("<html><body><h1>Erreur de base de données</h1></body></html>", "1").ok);
check("tableau vide -> illisible", !M.parseReport('<table class="user-grade"></table>', "1").ok);
check("page coupée au milieu -> illisible", !M.parseReport(page([row("A", "10", "0–20")]).split("</tbody>")[0], "1").ok);
check("page d'un autre cours -> illisible", !M.parseReport(page([row("A", "10", "0–20")], "2"), "1").ok);
check("page de connexion -> session", M.parseReport('<form><input type="password" name="password"></form>', "1").reason === "session");
const empty = read([row("A", "-", "0–20")]);
check("cours réellement sans note -> lu, zéro note, zéro anomalie", empty.ok && empty.grades.length === 0 && empty.anomalies.length === 0);

// ---- changements de structure
const noClass = (h) => h.replace(/ class="column-(weight|grade|range|feedback)"/g, "");
const byText = M.parseReport(noClass(page([row("A", "15", "0–20")])), "1");
check("classes de colonnes disparues : lecture par le texte des en-têtes, signalée", byText.ok && byText.grades.length === 1 && byText.grades[0].raw === 15 && /en-têtes/.test(byText.strategy), byText);
const unknown = M.parseReport(noClass(page([row("A", "15", "0–20")])).replace(/<thead>[\s\S]*<\/thead>/, ""), "1");
check("structure méconnaissable : refusée, aucune note inventée", !unknown.ok && unknown.grades.length === 0, unknown);
check("tableau imbriqué dans un commentaire : rien de perdu", read([row("A", "10", "0–20", { fb: "<table><tr><td>d</td></tr></table>" }), row("B", "15", "0–20")]).grades.length === 2);
check("barème « 0-20 » lu", (read([row("A", "15", "0-20")]).grades[0] || {}).max === 20);
const noRange = read([row("A", "15", "")]);
check("barème absent : anomalie signalée, aucune note inventée", noRange.grades.length === 0 && noRange.anomalies.length === 1, noRange);
check("note illisible : anomalie signalée", read([row("A", "1 000,00 / 2", "0–20")]).anomalies.length === 1);

// ---- note modifiée
let s = step(null, [row("DS", "12", "0–20", { gid: 5 })], 1).store;
s = M.decide(s, only(s).id, "validated", { matiere: "R1.01 : Cours", coeff: 3 }, 2);
let r = step(s, [row("DS", "13", "0–20", { gid: 5 })], 3);
check("note modifiée : validation et ancienne valeur conservées, changement à confirmer", only(r.store).status === "validated" && only(r.store).raw === 12 && !!only(r.store).change && only(r.store).change.raw === 13 && r.fresh.length === 1);
check("note modifiée : la moyenne ne bouge pas avant confirmation", M.mergeReleve(releve, r.store).ue[0].matieres[0].evals[0].note === 12);
check("note modifiée : historique", (only(r.store).history || []).some((h) => h.kind === "note"));
const r2 = step(r.store, [row("DS", "13", "0–20", { gid: 5 })], 4);
check("note modifiée : pas de nouvelle alerte à chaque scan", r2.fresh.length === 0 && !!only(r2.store).change);
const acc = M.resolveChange(r.store, only(r.store).id, true, 5);
check("accepter : nouvelle valeur, coefficient gardé", only(acc).raw === 13 && !only(acc).change && only(acc).coeff === 3);
const kept = M.resolveChange(r.store, only(r.store).id, false, 5);
const after = step(kept, [row("DS", "13", "0–20", { gid: 5 })], 6);
check("garder l'ancienne : pas redemandé tant que Moodle ne change pas encore", only(after.store).raw === 12 && !only(after.store).change && after.fresh.length === 0);
check("garder puis nouveau changement : redemandé", step(after.store, [row("DS", "14", "0–20", { gid: 5 })], 7).fresh.length === 1);
const scale = only(step(s, [row("DS", "12", "0–40", { gid: 5 })], 8).store);
check("changement de barème détecté", !!scale.change && scale.change.max === 40);
let w = step(null, [row("W", "12", "0–20", { gid: 6, weight: "40,00 %" })], 1).store;
w = step(w, [row("W", "12", "0–20", { gid: 6, weight: "25,00 %" })], 2).store;
check("changement de pondération historisé ; coefficient non confirmé", only(w).weight === 25 && (only(w).history || []).some((h) => h.kind === "pondération") && only(w).coeffConfirmed === false);

// ---- renommage, déplacement, suppression
s = step(null, [row("TP 1", "14", "0–20", { gid: 7 })], 1).store;
s = M.decide(s, only(s).id, "validated", { matiere: "R1.01 : Cours" }, 2);
r = step(s, [row("TP 1 (rattrapage)", "14", "0–20", { gid: 7 })], 3);
check("activité renommée : une seule note, décision gardée", Object.keys(r.store.items).length === 1 && only(r.store).status === "validated" && only(r.store).title === "TP 1 (rattrapage)" && r.fresh.length === 0);
r = step(s, [], 4);
check("activité supprimée : signalée, jamais effacée", only(r.store).missingSince === 4 && only(r.store).status === "validated" && r.missing.length === 1 && /n'apparaît plus/.test(only(r.store).missingWhy));
const back = step(r.store, [row("TP 1", "14", "0–20", { gid: 7 })], 5);
check("activité réapparue : signalement levé", !only(back.store).missingSince);
const gone = step(s, [row("TP 1", "-", "0–20", { gid: 7 })], 6);
check("note retirée (activité encore là) : signalée comme telle", /retirée/.test(only(gone.store).missingWhy || ""));
check("cours non lu : rien n'est déclaré disparu", M.diff(s, [], releve, 7, { read: {} }).missing.length === 0);
check("sans liste des cours lus : rien n'est déclaré disparu", M.diff(s, [], releve, 7).missing.length === 0);

// ---- homonymes et doublons
const two = (a, b) => [row("Quiz", a[0], "0–20", { gid: a[1], link: "quiz:" + a[1] }), row("Quiz", b[0], "0–20", { gid: b[1], link: "quiz:" + b[1] })];
s = step(null, two(["4", 11], ["18", 22]), 1).store;
const low = Object.values(s.items).find((x) => x.raw === 4);
s = M.decide(s, low.id, "refused", {}, 2);
r = step(s, two(["18", 22], ["4", 11]), 3);
check("homonymes réordonnés : chaque décision reste sur sa note", r.fresh.length === 0 && r.store.items[low.id].raw === 4 && r.store.items[low.id].status === "refused" && Object.keys(r.store.items).length === 2);
const old = (id, raw, status, extra) => Object.assign({ id, courseId: "1", course: "R1.01 Cours", title: "Quiz", raw, max: 20, note20: raw, status, coeff: 1, at: 1 }, extra);
const legacy = { sync: "2026-01-01T00:00:00Z", items: { "MDL|1|quiz": old("MDL|1|quiz", 4, "refused"), "MDL|1|quiz|2": old("MDL|1|quiz|2", 18, "validated", { matiere: "R1.01 : Cours", coeff: 2 }) } };
r = step(legacy, two(["18", 22], ["4", 11]), 4);
check("anciennes données : mêmes identifiants, décisions gardées malgré l'ordre inversé", Object.keys(r.store.items).length === 2 && r.store.items["MDL|1|quiz"].status === "refused" && r.store.items["MDL|1|quiz|2"].status === "validated" && r.store.items["MDL|1|quiz|2"].ref === "#22" && r.fresh.length === 0, r.store.items);
s = step(null, [row("Projet", "15", "0–20")], 1).store;
s = M.decide(s, only(s).id, "validated", { matiere: "R1.01 : Cours" }, 2);
r = step(s, [row("Projet final", "15", "0–20")], 3);
check("renommage sans identifiant : doublon probable signalé, rien de fusionné tout seul", Object.keys(r.store.items).length === 2 && Object.values(r.store.items).some((x) => x.dupOf === only(s).id && x.status === "pending"));

// ---- conservation
s = step(null, [row("Gardée", "16", "0–20", { gid: 1 })], 1).store;
s = M.decide(s, only(s).id, "validated", { matiere: "R1.01 : Cours" }, 2);
const keepId = only(s).id;
r = step(s, Array.from({ length: 2100 }, (_, i) => row("N" + i, "10", "0–20", { gid: 100 + i })), 3);
check("plus de 2000 notes : aucune note décidée supprimée", !!r.store.items[keepId] && r.store.items[keepId].status === "validated");

// ---- mémoire de la matière
s = step(null, [row("A", "10", "0–20", { gid: 1 })], 1).store;
s = M.decide(s, only(s).id, "validated", { matiere: "R1.02 : Autre" }, 2);
r = step(s, [row("A", "10", "0–20", { gid: 1 }), row("B", "11", "0–20", { gid: 2 })], 3);
const b = Object.values(r.store.items).find((x) => x.title === "B");
check("matière déjà choisie pour ce cours : reproposée en premier", b.matiere === "R1.02 : Autre" && b.how === "memoire", b);

// ---- import (décisions de deux appareils)
const base = step(null, [row("A", "10", "0–20", { gid: 1 }), row("B", "11", "0–20", { gid: 2 })], 1).store;
const [ia, ib] = Object.keys(base.items);
const phone = M.decide(base, ia, "validated", { matiere: "R1.01 : Cours" }, 50);
const computer = M.decide(base, ib, "refused", {}, 60);
let merged = M.mergeStores(phone, computer);
check("import : les décisions des deux appareils sont gardées", merged.items[ia].status === "validated" && merged.items[ib].status === "refused", merged.items);
merged = M.mergeStores(phone, M.decide(base, ia, "refused", {}, 40));
check("import : une décision plus ancienne n'écrase pas la plus récente", merged.items[ia].status === "validated");
merged = M.mergeStores(phone, base);
check("import : une note sans décision n'écrase pas une décision", merged.items[ia].status === "validated");
check("import : remise en attente plus récente respectée", M.mergeStores(phone, M.decide(phone, ia, "pending", {}, 90)).items[ia].status === "pending");

// ---- deux années différentes : les numéros de cours et de notes peuvent se répéter
const y = (course, title, raw) => [{ courseId: "42", course, title, raw, max: 20, note20: raw, gradeId: "7" }];
let ys = M.diff(null, y("R1.01 Cours 2026", "DS", 15), null, 1, { host: "moodle2026.uca.fr" }).store;
const yid = Object.keys(ys.items)[0];
ys = M.decide(ys, yid, "validated", { matiere: "R1.01 : Cours", coeff: 2 }, 2);
const other = M.diff(ys, y("Autre cours de 2025", "Examen", 6), null, 3, { host: "moodle2025.uca.fr", read: { 42: [] }, listed: ["42"] });
check("autre année : la note validée n'est ni renommée, ni modifiée, ni déclarée disparue", other.store.items[yid].title === "DS" && other.store.items[yid].raw === 15 && !other.store.items[yid].change && !other.store.items[yid].missingSince && Object.keys(other.store.items).length === 2, other.store.items);
check("import : une note d'une autre année ne remplace pas la mienne", M.mergeStores(ys, other.store).items[yid].title === "DS");
const gone2 = M.diff(ys, [], null, 4, { host: "moodle2026.uca.fr", read: {}, listed: ["99"] });
check("cours disparu de la page Notes : signalé, note conservée", /cours n'apparaît plus/.test(gone2.store.items[yid].missingWhy || "") && gone2.store.items[yid].status === "validated", gone2.store.items[yid]);
check("liste des cours inconnue : aucun cours déclaré disparu", M.diff(ys, [], null, 4, { host: "moodle2026.uca.fr", read: {} }).missing.length === 0);
const junk = { sync: "2027-01-01", items: { a: null, b: "texte", c: { id: "x" }, d: { id: "MDL|1|z", courseId: "1", title: "z", status: "pirate", raw: 1, max: 20, note20: 1 }, e: { id: "MDL|1|y", courseId: "1", title: "y", status: "pending", raw: "20", max: 20, note20: 20 } } };
let safe = null; try { safe = M.mergeStores(ys, junk); } catch (e) { safe = e.message; }
check("import de données mal formées : ignorées sans erreur", safe && safe.items && Object.keys(safe.items).join() === yid, safe);

console.log(`\n${total - fails}/${total} vérifications OK`);
process.exit(fails ? 1 : 0);
