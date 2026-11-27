/* App Android : lance le moteur commun (core/moodle-scan.js) DEPUIS la page Moodle (même origine, donc avec la session
   de l'utilisateur). Injecté par UcaMoodle.kt après core/moodle.js et core/moodle-scan.js, dans une WebView invisible qui
   n'affiche que Moodle. Rien n'est envoyé ailleurs : l'application relit window.__ucaMoodleJob. */
(function () {
"use strict";
if (window.__ucaMoodleJob) return;
const job = window.__ucaMoodleJob = { done: 0, total: 0, label: "", beat: 0, checkpoint: null, result: null };
UCA_MOODLE_SCAN.run({
  origin: location.origin,
  get: UCA_MOODLE_SCAN.pageGet(location.origin),
  listCourses: UCA_MOODLE_SCAN.pageList(location.origin),
  checkpoint: window.__ucaMoodleCheckpoint || null,
  onProgress: (p) => { job.done = p.done; job.total = p.total; job.label = p.label; },
  onBeat: () => { job.beat++; },
  onCheckpoint: (c) => { job.checkpoint = c; },
}).then((r) => { if (r.report) job.done = r.report.read + r.report.failed; job.result = r; }, (e) => { job.result = { issue: "error", detail: String((e && e.message) || e).slice(0, 80) }; });
})();
