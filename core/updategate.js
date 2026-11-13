/* Verrou « mise à jour obligatoire » de l'extension (popup, agenda, paramètres, choix du design).
   Tant que la version installée est plus ancienne que la dernière version connue (uca_latest_version, écrite par
   background.js à chaque vérification GitHub), une fenêtre plein écran bloque tout et ne peut pas être fermée.
   Résistant : l'état est recalculé à chaque chargement / retour sur la page / changement du stockage depuis la
   version installée (chrome.runtime.getManifest) et la dernière version connue, jamais depuis un « ignoré » ; si la
   fenêtre est retirée du DOM elle est remise, le reste de la page reste inerte (inert + aria-hidden).
   Inactif dans l'app web / l'APK (window.UCA_APP) et dans les paquets des magasins (uca_store_build). */
(function () {
  "use strict";
  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  ready(function () {
    if (window.UCA_APP || !window.chrome || !chrome.runtime || !chrome.runtime.getManifest || !chrome.storage || !chrome.storage.local) return;
    if (/[?&]demo=1(?:&|$)/.test(location.search)) return;
    var CURRENT = chrome.runtime.getManifest().version;
    var KEYS = ["uca_store_build", "uca_latest_version"];
    var gate = null, latest = null;

    function cmp(a, b) {
      var pa = String(a).split(".").map(function (n) { return parseInt(n, 10) || 0; });
      var pb = String(b).split(".").map(function (n) { return parseInt(n, 10) || 0; });
      for (var i = 0; i < Math.max(pa.length, pb.length); i++) { var x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x - y; }
      return 0;
    }
    function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }

    function build() {
      var dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
      var bg = dark ? "#0f1218" : "#f5f7fb", fg = dark ? "#e9edf5" : "#18202e", dim = dark ? "#a0a9ba" : "#5a6478", accent = dark ? "#8ab4f8" : "#0b57d0";
      var g = el("div", "position:fixed;inset:0;z-index:2147483647;background:" + bg + ";color:" + fg + ";display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;");
      g.id = "ucaUpdateGate"; g.setAttribute("role", "alertdialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "ucaGateTitle"); g.setAttribute("aria-describedby", "ucaGateDesc");
      var box = el("div", "max-width:460px;width:100%;text-align:center;");
      var h = el("h1", "font-size:24px;margin:0 0 10px;letter-spacing:-.02em;", "Mise à jour obligatoire"); h.id = "ucaGateTitle";
      var p = el("p", "margin:0 0 6px;color:" + dim + ";"); p.id = "ucaGateDesc";
      p.textContent = "Cette version de l'extension est périmée : elle est verrouillée tant qu'elle n'est pas à jour (rien ne fonctionne en attendant).";
      var v = el("p", "margin:0 0 18px;font-weight:700;"); v.id = "ucaGateVersions";
      var btn = el("button", "font:inherit;font-weight:700;border:0;border-radius:12px;padding:13px 22px;min-height:46px;background:" + accent + ";color:" + (dark ? "#0b1d3a" : "#fff") + ";cursor:pointer;width:100%;", "Télécharger et appliquer la mise à jour");
      btn.type = "button";
      var status = el("p", "min-height:22px;margin:12px 0 0;font-size:14px;font-weight:600;"); status.id = "ucaGateStatus"; status.setAttribute("role", "status");
      var busy = false;
      btn.addEventListener("click", function () {
        if (busy) return;
        var SU = window.UCA_SELFUPDATE;
        // Le popup se ferme dès qu'une boîte de sélection s'ouvre : la mise à jour se fait dans un onglet.
        if (/popup\.html$/.test(location.pathname)) { chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") }); window.close(); return; }
        if (!SU || !SU.supported(true)) { status.textContent = "Mise à jour automatique indisponible ici : suis les étapes manuelles ci-dessous."; chrome.runtime.sendMessage({ type: "UCA_APPLY_UPDATE" }); return; }
        busy = true; btn.disabled = true; status.style.color = dim;
        SU.run({ interactive: true, onProgress: function (n, total, label) { status.textContent = total > 1 ? "Application des changements : " + n + " / " + total : label; } })
          .then(function (v) {
            status.textContent = "Mise à jour installée (" + v + "). Rechargement de l'extension…";
            setTimeout(function () { chrome.runtime.reload(); }, 600);
          })
          .catch(function (e) {
            busy = false; btn.disabled = false;
            status.style.color = dark ? "#f28b82" : "#b3261e";
            status.textContent = e && e.name === "AbortError" ? "Choix du dossier annulé : réessaie." : "Échec : " + ((e && e.message) || e);
          });
      });
      var how = el("p", "margin:14px 0 6px;font-size:14px;color:" + dim + ";", "Première fois : choisis le dossier de l'extension (celui chargé dans chrome://extensions) et autorise l'écriture. La dernière version est téléchargée, appliquée, puis l'extension se recharge. Ensuite, les mises à jour suivantes se font avec ce même dossier. Firefox ou échec : remplace le dossier à la main puis « Recharger ».");
      // Firefox n'a pas de sélecteur de dossier : parcours en deux temps (script, puis un nouveau clic sur le bouton).
      if (typeof window.showDirectoryPicker !== "function") {
        how.textContent = "Firefox : télécharge et lance maj-extension.bat (lien ci-dessous) en lui donnant le dossier de l'extension. Il remplace les fichiers, puis reviens ici et clique de nouveau sur le bouton : l'extension se recharge toute seule.";
      }
      var link = el("a","display:inline-block;margin:4px 0;color:" + accent + ";font-weight:600;", "Page de téléchargement (ZIP et script maj-extension.bat)");
      link.href = "https://kiricoucou.github.io/uca-extension/extension/#maj"; link.target = "_blank"; link.rel = "noopener";
      var again = el("button", "display:block;margin:10px auto 0;font:inherit;border:0;background:none;color:" + accent + ";text-decoration:underline;cursor:pointer;padding:8px;min-height:36px;", "Vérifier à nouveau");
      again.type = "button";
      again.addEventListener("click", function () { again.textContent = "Vérification…"; chrome.runtime.sendMessage({ type: "UCA_FORCE_UPDATE_CHECK" }); setTimeout(function () { again.textContent = "Vérifier à nouveau"; evaluate(); }, 3500); });
      box.append(h, p, v, btn, status, how, link, again);
      g.appendChild(box);
      // Ni Échap ni Tab ne permettent de sortir de la fenêtre.
      g.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
        if (e.key === "Tab") {
          var f = g.querySelectorAll("button,a[href]"); if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }, true);
      return g;
    }

    function enforce() {
      if (!document.body) return;
      if (!gate) gate = build();
      document.documentElement.style.overflow = "hidden";
      if (gate.parentNode !== document.body) document.body.appendChild(gate);
      var vs = gate.querySelector("#ucaGateVersions");
      if (vs) vs.textContent = "Installée : " + CURRENT + " · Dernière : " + latest;
      Array.prototype.forEach.call(document.body.children, function (c) {
        if (c === gate) return;
        if (!c.inert) c.inert = true;
        if (c.getAttribute("aria-hidden") !== "true") c.setAttribute("aria-hidden", "true");
      });
      if (!gate.contains(document.activeElement)) { var b = gate.querySelector("button"); if (b) b.focus(); }
    }
    function release() {
      if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
      Array.prototype.forEach.call(document.body.children, function (c) { if (c.inert) c.inert = false; c.removeAttribute("aria-hidden"); });
      gate = null;
      document.documentElement.style.overflow = "";
    }
    function evaluate() {
      chrome.storage.local.get(KEYS, function (d) {
        latest = d.uca_latest_version || null;
        var must = !d.uca_store_build && !!latest && cmp(CURRENT, latest) < 0;
        if (must) enforce(); else if (gate) release();
      });
    }

    evaluate();
    chrome.storage.onChanged.addListener(function (c, area) { if (area === "local" && (c.uca_latest_version || c.uca_store_build || c.uca_update_available)) evaluate(); });
    ["pageshow", "focus", "visibilitychange"].forEach(function (ev) { window.addEventListener(ev, evaluate); document.addEventListener(ev, evaluate); });
    // Retrait de la fenêtre ou de l'attribut inert par un script / les outils de développement : remis aussitôt.
    new MutationObserver(function () { if (gate) enforce(); }).observe(document.body, { childList: true });
    setInterval(function () { if (gate) enforce(); }, 1500);
  });
})();
