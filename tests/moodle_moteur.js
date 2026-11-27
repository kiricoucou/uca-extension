// Moteur de recherche Moodle (core/moodle-scan.js) avec un Moodle simulé : node tests/moodle_moteur.js
const path = require("path");
require(path.join(__dirname, "..", "core", "moodle.js"));
require(path.join(__dirname, "..", "core", "moodle-scan.js"));
const M = globalThis.UCA_MOODLE, S = globalThis.UCA_MOODLE_SCAN;
let fails = 0, total = 0;
const check = (name, ok, detail) => { total++; if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + name + (!ok && detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 500) : "")); };
const O = "https://moodle2026.uca.fr";
const overview = (ids) => `<body id="page-grade-report-overview-index"><table id="overview-grade">${ids.map((i) => `<tr><td><a href="${O}/course/user.php?mode=grade&amp;id=${i}&amp;user=9">Cours ${i}</a></td></tr>`).join("")}</table></body>`;
const row = (gid, title, grade, range = "0–20") => `<tr><th class="item column-itemname" id="row_${gid}_9"><div class="rowtitle"><span class="gradeitemheader">${title}</span></div></th><td class="column-grade">${grade}</td><td class="column-range">${range}</td></tr>`;
const report = (id, rows) => `<body class="path-course course-${id}"><table class="user-grade"><thead><tr><th class="column-itemname">Élément d’évaluation</th><th class="column-grade">Note</th><th class="column-range">Valeurs possibles</th></tr></thead><tbody>${rows.join("")}<tr><th class="baggt column-itemname">Total du cours</th><td class="column-grade">-</td></tr></tbody></table></body>`;

/* site : { <id>: html | (n° d'essai) => réponse } ; une réponse peut être {status,url,html} ou "throw". */
function moodle(site, ids = Object.keys(site)) {
  const calls = {};
  const get = async (p) => {
    const id = p.includes("overview") ? "overview" : /[?&]id=(\d+)/.exec(p)[1];
    calls[id] = (calls[id] || 0) + 1;
    let r = id === "overview" && !site.overview ? overview(ids.filter((x) => x !== "overview")) : site[id];
    if (typeof r === "function") r = r(calls[id]);
    if (r === "throw") throw new Error("réseau");
    if (typeof r === "string") r = { status: 200, url: O + p, html: r };
    return Object.assign({ status: 200, url: O + p, html: "" }, r);
  };
  return { get, calls };
}
const waits = [];
const run = (m, extra) => S.run(Object.assign({ get: m.get, origin: O, sleep: async (ms) => { waits.push(ms); } }, extra));
const ok = (id) => report(id, [row(id * 10, "DS " + id, "12")]);
const LOGIN = { url: "https://ent.uca.fr/cas/login?service=x", html: "<form></form>" };

(async () => {
  // session valide
  let m = moodle({ 1: ok(1), 2: ok(2), 3: report(3, [row(30, "Rien", "-")]) });
  let r = await run(m);
  check("session valide : complète, 3/3 lus, 2 notes", r.issue === null && r.report.complete && r.report.read === 3 && r.data.length === 2 && r.checkpoint === null, r);
  check("cours sans note : lu (pas un échec)", r.report.courses[2].status === "lu" && r.report.courses[2].notes === 0);
  check("une seule demande par page", Object.values(m.calls).every((n) => n === 1), m.calls);

  // session expirée dès le départ
  r = await run(moodle({ overview: LOGIN }, []));
  check("session expirée : signalée, aucune donnée", r.issue === "session" && !r.data && !r.report, r);
  r = await run(moodle({ overview: '<form><input name="username"><input type="password" name="password"></form>' }, []));
  check("formulaire de connexion servi en 200 : session expirée", r.issue === "session");

  // cours inaccessible
  m = moodle({ 1: ok(1), 2: { status: 403 }, 3: ok(3) });
  r = await run(m);
  check("cours inaccessible : synchro INCOMPLÈTE, cours nommé avec la raison", r.issue === "partial" && !r.report.complete && r.report.failed === 1 && r.report.courses[1].name === "Cours 2" && r.report.courses[1].reason === "HTTP 403", r.report);
  check("accès refusé : pas de nouvelle tentative", m.calls["2"] === 1);
  check("les autres cours sont quand même lus", r.data.length === 2 && !("2" in r.read));

  // erreur passagère puis réussite
  waits.length = 0;
  m = moodle({ 1: (n) => n < 3 ? { status: 503 } : ok(1) });
  r = await run(m);
  check("erreur passagère : 3e essai réussi, attentes croissantes", r.issue === null && m.calls["1"] === 3 && waits.includes(1000) && waits.includes(3000), { calls: m.calls, waits });
  waits.length = 0;
  r = await run(moodle({ 1: (n) => n === 1 ? { status: 429, retryAfter: 7 } : ok(1) }));
  check("429 : le délai demandé par Moodle est respecté", r.issue === null && waits.includes(7000), waits);

  // erreur de chargement HTML : jamais « aucune note »
  r = await run(moodle({ 1: ok(1), 2: "<html><h1>Erreur</h1></html>" }));
  check("page d'erreur en 200 : échec du cours, pas « aucune note »", r.issue === "partial" && r.report.courses[1].status === "échec" && /introuvable/.test(r.report.courses[1].reason) && !("2" in r.read), r.report.courses[1]);
  r = await run(moodle({ 1: report(1, [row(10, "A", "15")]).split("</tbody>")[0] }));
  check("page tronquée : échec, aucune donnée retenue", r.issue === "error" && !r.data, r);
  r = await run(moodle({ 1: report(1, [row(10, "A", "15", "")]) }));
  check("ligne illisible : synchro incomplète et ligne nommée", r.issue === "partial" && r.report.anomalies === 1 && r.report.courses[0].anomalies[0].title === "A" && !("1" in r.read), r.report);
  r = await run(moodle({ overview: "<html>maintenance</html>" }, []));
  check("page Notes non reconnue : changement de structure signalé", r.issue === "structure");

  // la page « Notes » change : liste de secours, jamais annoncée complète
  const changed = moodle({ overview: "<html>nouvelle présentation</html>", 1: ok(1), 2: ok(2) }, ["1", "2"]);
  r = await run(changed, { listCourses: async () => ({ userId: "9", courses: [{ id: "1", name: "Cours 1" }, { id: "2", name: "Cours 2" }] }) });
  check("page Notes modifiée : notes lues par la liste de secours, synchro marquée incomplète", r.data && r.data.length === 2 && r.issue === "partial" && r.report.fallback === true && !r.report.complete && r.listed === null, r);
  r = await run(moodle({ overview: "<html>nouvelle présentation</html>" }, []), { listCourses: async () => { throw new Error("refusé"); } });
  check("secours indisponible : changement de structure signalé", r.issue === "structure" && !r.data, r);
  r = await run(moodle({ 1: ok(1) }));
  check("liste normale : les cours de la page Notes sont transmis (pour repérer un cours disparu)", Array.isArray(r.listed) && r.listed.join() === "1");

  // Moodle ne répond plus
  m = moodle({ 1: ok(1), 2: "throw", 3: "throw", 4: "throw", 5: "throw", 6: ok(6), 7: ok(7) });
  r = await run(m);
  check("4 échecs réseau de suite : arrêt, cours restants marqués « non lu »", r.issue === "partial" && r.report.failed === 4 && r.report.notRead === 2 && !m.calls["6"], r.report);

  // scan interrompu puis repris
  let saved = null;
  m = moodle({ 1: ok(1), 2: ok(2), 3: LOGIN, 4: ok(4) });
  r = await run(m, { onCheckpoint: (c) => { saved = JSON.parse(JSON.stringify(c)); } });
  check("coupure de session au milieu : signalée, cours déjà lus conservés, le reste « non lu »", r.issue === "session" && r.data.length === 2 && r.report.read === 2 && r.report.notRead === 2 && !r.report.complete, r.report);
  check("coupure : point de reprise enregistré au fil de l'eau", saved && Object.keys(saved.courses).join() === "1,2");
  m = moodle({ 1: ok(1), 2: ok(2), 3: ok(3), 4: ok(4) });
  r = await run(m, { checkpoint: saved });
  check("reprise : les cours déjà lus ne sont pas relus, synchro complète", r.issue === null && !m.calls["1"] && !m.calls["2"] && m.calls["3"] === 1 && r.report.resumed === 2 && r.data.length === 4, { calls: m.calls, rep: r.report });
  m = moodle({ 1: ok(1) });
  r = await run(m, { checkpoint: Object.assign({}, saved, { at: Date.now() - 31 * 60 * 1000 }) });
  check("point de reprise trop vieux : tout est relu", m.calls["1"] === 1 && r.report.resumed === 0);
  m = moodle({ 1: ok(1) });
  await run(m, { checkpoint: Object.assign({}, saved, { userId: "autre" }) });
  check("point de reprise d'un autre compte : ignoré", m.calls["1"] === 1);

  // synchro partielle appliquée aux données : rien n'est déclaré disparu dans un cours non lu
  const first = await run(moodle({ 1: ok(1), 2: ok(2) }));
  let st = M.diff(null, first.data, null, 1, { read: first.read }).store;
  Object.keys(st.items).forEach((k) => { st = M.decide(st, k, "validated", { matiere: "X" }, 2); });
  const part = await run(moodle({ 1: ok(1), 2: { status: 500 } }));
  const d = M.diff(st, part.data, null, 3, { read: part.read });
  check("synchro partielle : les notes du cours en échec restent validées et non « disparues »", d.missing.length === 0 && Object.values(d.store.items).every((x) => x.status === "validated" && !x.missingSince), d.store.items);

  // beaucoup de cours
  const big = {}; for (let i = 1; i <= 205; i++) big[i] = ok(i);
  r = await run(moodle(big));
  check("au-delà de la limite de cours : signalé, jamais « complet »", r.report.truncated === 5 && !r.report.complete && r.issue === "partial", { t: r.report.truncated, issue: r.issue });

  // aucune donnée personnelle dans le détail destiné au journal
  r = await run(moodle({ 1: ok(1), 2: { status: 403 } }));
  check("résumé du journal : des chiffres seulement (aucun nom de cours ni note)", !/Cours|DS/.test(r.detail), r.detail);

  console.log(`\n${total - fails}/${total} vérifications OK`);
  process.exit(fails ? 1 : 0);
})();
