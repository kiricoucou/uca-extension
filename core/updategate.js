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
      var g = el("div", "position:fixed;inset:0;z-index:2147483647;background:" + bg + ";color:" + fg + ";display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;padding:40px 20px 20px;overflow:auto;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;");
      g.id = "ucaUpdateGate"; g.setAttribute("role", "alertdialog"); g.setAttribute("aria-modal", "true"); g.setAttribute("aria-labelledby", "ucaGateTitle"); g.setAttribute("aria-describedby", "ucaGateDesc");
      var box = el("div", "max-width:460px;width:100%;text-align:center;margin:auto 0;");
      var h = el("h1", "font-size:24px;margin:0 0 10px;letter-spacing:-.02em;", "Mise à jour obligatoire"); h.id = "ucaGateTitle";
      var p = el("p", "margin:0 0 6px;color:" + dim + ";"); p.id = "ucaGateDesc";
      p.textContent = "Cette version de l'extension est périmée : elle est verrouillée tant qu'elle n'est pas à jour (rien ne fonctionne en attendant).";
      var v = el("p", "margin:0 0 18px;font-weight:700;"); v.id = "ucaGateVersions";
      var btn = el("button", "font:inherit;font-weight:700;border:0;border-radius:12px;padding:13px 22px;min-height:46px;background:" + accent + ";color:" + (dark ? "#0b1d3a" : "#fff") + ";cursor:pointer;width:100%;", "Télécharger et appliquer la mise à jour");
      btn.type = "button";
      btn.id = "ucaGateApply";
      var cmdBox = el("div", "display:none;margin-top:12px;text-align:left;");
      function fromUA() {
        var ua = navigator.userAgent || "";
        var os = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "macos" : "linux";
        var br = /Firefox\//.test(ua) ? "firefox" : /Edg\//.test(ua) ? "edge" : /Vivaldi/i.test(ua) ? "vivaldi" : (navigator.brave ? "brave" : "chrome");
        return { os: os, browser: br };
      }
      /* UN seul bouton, et jamais de dossier à choisir (une extension ne connaît pas son propre dossier : c'est le pilote
         qui le retrouve). Au clic :
         1. fichiers déjà à jour sur le disque : on recharge ;
         2. dossier déjà autorisé autrefois (autorisation toujours valable) : mise à jour sans aucune fenêtre ;
         3. pilote installé : on le lance (lien uca-maj:) ; il affiche ses fenêtres, l'utilisateur valide ;
         4. sinon, première fois : on télécharge le pilote du système ; l'utilisateur l'ouvre une fois, il s'installe.
         Une extension ne peut pas exécuter un fichier elle-même : seul le lien enregistré par le pilote le permet.
         Après un lancement ou un téléchargement, on relit le manifeste sur le disque et on recharge dès que la version change. */
      function diskVersion() {
        return fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) { return String(m.version || ""); }).catch(function () { return ""; });
      }
      var watching = null;
      function watch() {
        clearInterval(watching);
        var n = 0;
        watching = setInterval(function () {
          if (++n > 200) { clearInterval(watching); return; }
          diskVersion().then(function (v) {
            if (v && cmp(v, CURRENT) > 0) { clearInterval(watching); say("Mise à jour détectée (" + v + "). Rechargement de l'extension…"); setTimeout(function () { chrome.runtime.reload(); }, 800); }
          });
        }, 3000);
      }
      function say(t) { status.style.color = dim; status.textContent = t; }
      function textButton(label, onClick) {
        var x = el("button", "font:inherit;margin:8px 8px 0 0;border:0;background:none;color:" + accent + ";text-decoration:underline;cursor:pointer;padding:8px 0;min-height:40px;", label);
        x.type = "button"; x.addEventListener("click", onClick); return x;
      }
      // Recharger ne sert que si les fichiers du dossier chargé ont vraiment changé : on le vérifie au lieu de croire sur parole.
      function reloadButton() {
        return textButton("Vérifier si la mise à jour est faite", function () {
          say("Vérification des fichiers de l'extension…");
          diskVersion().then(function (v) {
            if (v && cmp(v, CURRENT) > 0) { say("Nouvelle version " + v + " trouvée dans le dossier. Rechargement de l'extension…"); setTimeout(function () { chrome.runtime.reload(); }, 600); return; }
            status.style.color = dark ? "#f28b82" : "#b3261e";
            status.textContent = "La mise à jour N'EST PAS faite : le dossier que ton navigateur charge est toujours en version " + (v || CURRENT) + ". Le pilote n'a pas été lancé, ou il a mis à jour un autre dossier (compare avec le dossier affiché dans chrome://extensions, « Détails »).";
          });
        });
      }
      function ownId() { var id = String((chrome.runtime && chrome.runtime.id) || ""); return /^[a-p]{32}$/.test(id) ? id : ""; }
      function launchPilot(info) {
        say("Ouverture du pilote de mise à jour… Si le navigateur demande l'autorisation, accepte, puis suis ses fenêtres (vérifie le dossier proposé, puis « Valider »).");
        var a = document.createElement("a"); a.href = "uca-maj:" + info.browser + (ownId() ? "/" + ownId() : ""); a.id = "ucaPilotLink"; document.body.appendChild(a); a.click(); a.remove();
        cmdBox.textContent = ""; cmdBox.style.display = "block";
        cmdBox.append(
          el("p", "margin:0;font-size:14px;color:" + dim + ";", "Garde cette page ouverte : l'extension se rechargera toute seule quand le pilote aura fini."),
          textButton("Rien ne s'est ouvert ? Réinstaller le pilote", function () { chrome.storage.local.remove("uca_pilot_ok", function () { installPilot(info); }); }),
          reloadButton());
        watch();
      }
      // Première fois : télécharge le pilote du système et propose la commande complète (navigateur, OS, nouvelle version).
      function installPilot(info) {
        var source = info.os === "windows" ? "maj-extension.bat" : info.os === "macos" ? "maj-extension.command" : "maj-extension.sh";
        say("Téléchargement du pilote de mise à jour…");
        fetch("https://kiricoucou.github.io/uca-extension/extension/" + source, { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
          .then(function (b) { return b.text().then(function (code) {
            // Le nom porte la version écrite DANS le pilote reçu (chiffres et points seulement) : maj-extension-v2.0.bat.
            var m = /PILOT_VERSION="?(\d{1,3}(?:\.\d{1,3}){1,2})"/.exec(code);
            var file = m ? source.replace("maj-extension.", "maj-extension-v" + m[1] + ".") : source;
            var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = file; document.body.appendChild(a); a.click(); a.remove();
            chrome.storage.local.set({ uca_pilot_pending: CURRENT });
            say(file + " téléchargé dans tes Téléchargements.");
            showCommand(info, file, m ? m[1] : "");
            watch();
          }); })
          .catch(function () {
            status.textContent = "Téléchargement automatique impossible : ouvre la page de mise à jour.";
            window.open("https://kiricoucou.github.io/uca-extension/mise-a-jour.html", "_blank", "noopener");
          });
      }
      function showCommand(info, file, pilotVersion) {
        chrome.storage.local.get("uca_latest_version", function (d) {
          var ver = (d && d.uca_latest_version) || "";
          if (!/^\d{1,4}(\.\d{1,5}){1,3}$/.test(String(ver))) ver = "";   // jamais de texte libre dans une commande de terminal
          var cmd = info.os === "windows"
            ? "\"%USERPROFILE%\\Downloads\\" + file + "\" /browser " + info.browser + " /os windows /version " + ver + (ownId() ? " /id " + ownId() : "")
            : "bash ~/Downloads/" + file + " --browser " + info.browser + " --os " + info.os + " --version " + ver + (ownId() ? " --id " + ownId() : "");
          cmdBox.textContent = "";
          cmdBox.style.display = "block";
          cmdBox.appendChild(el("p", "margin:0 0 6px;font-size:14px;color:" + dim + ";", "Une seule fois : ouvre " + file + " (liste des téléchargements du navigateur) et suis ses fenêtres. Il retrouve le dossier tout seul, met à jour et installe le pilote : les prochaines fois, ce bouton l'ouvrira directement. Autre moyen, la commande ci-dessous dans un terminal :"));
          if (pilotVersion) cmdBox.appendChild(el("p", "margin:0 0 6px;font-size:13px;color:" + dim + ";", "Pilote version " + pilotVersion + ". Un ancien fichier avec un autre numéro peut être supprimé."));
          var code = el("code", "display:block;padding:10px 12px;border-radius:10px;background:" + (dark ? "#171b23" : "#e8edf6") + ";font:12.5px/1.5 ui-monospace,Consolas,monospace;word-break:break-all;user-select:all;", cmd);
          var copy = el("button", "font:inherit;font-weight:600;margin:8px 8px 0 0;border:1px solid " + accent + ";background:transparent;color:" + accent + ";border-radius:10px;padding:8px 14px;min-height:40px;cursor:pointer;", "Copier la commande"); copy.type = "button";
          copy.addEventListener("click", function () { try { navigator.clipboard.writeText(cmd).then(function () { copy.textContent = "Copiée"; }, function () { copy.textContent = "Sélectionne et copie à la main"; }); } catch (e) { copy.textContent = "Sélectionne et copie à la main"; } });
          cmdBox.append(code, copy, textButton("J'ai déjà installé le pilote : le lancer", function () { chrome.storage.local.set({ uca_pilot_ok: true }, function () { launchPilot(info); }); }), reloadButton());
        });
      }
      var status = el("p", "min-height:22px;margin:12px 0 0;font-size:14px;font-weight:600;"); status.id = "ucaGateStatus"; status.setAttribute("role", "status");
      var busy = false;
      function free() { busy = false; btn.disabled = false; }
      function usePilot(info) {
        chrome.storage.local.get("uca_pilot_ok", function (d) { free(); if (d.uca_pilot_ok) launchPilot(info); else installPilot(info); });
      }
      btn.addEventListener("click", function () {
        if (busy) return;
        // Le popup se ferme au premier téléchargement ou lancement : la suite se passe dans un onglet.
        if (/popup\.html$/.test(location.pathname)) { chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") }); window.close(); return; }
        busy = true; btn.disabled = true; status.style.color = dim;
        var info = fromUA(), SU = window.UCA_SELFUPDATE;
        diskVersion().then(function (v) {
          if (v && cmp(v, CURRENT) > 0) { chrome.runtime.reload(); return; }
          if (!SU || !SU.supported(false)) { usePilot(info); return; }
          // interactive: false = aucune fenêtre, aucune demande de dossier : renvoie null si ce n'est pas possible.
          SU.run({ interactive: false, onProgress: function (n, total, label) { say(total > 1 ? "Application des changements : " + n + " / " + total : label); } })
            .then(function (done) {
              if (!done) { usePilot(info); return; }
              say("Mise à jour installée (" + done + "). Rechargement de l'extension…");
              setTimeout(function () { chrome.runtime.reload(); }, 600);
            })
            .catch(function () { usePilot(info); });
        });
      });
      var how = el("p", "margin:14px 0 6px;font-size:14px;color:" + dim + ";", "Aucun dossier à choisir : le pilote de mise à jour retrouve l'extension tout seul. La première fois, tu dois l'ouvrir toi-même (le navigateur interdit à une extension de lancer un fichier). Le fichier maj-extension qui est dans le dossier de l'extension convient aussi.");
      var link = el("a","display:inline-block;margin:4px 0;color:" + accent + ";font-weight:600;", "Page de téléchargement (ZIP et script maj-extension.bat)");
      link.href = "https://kiricoucou.github.io/uca-extension/extension/#maj"; link.target = "_blank"; link.rel = "noopener";
      var again = el("button", "display:block;margin:10px auto 0;font:inherit;border:0;background:none;color:" + accent + ";text-decoration:underline;cursor:pointer;padding:8px;min-height:36px;", "Vérifier à nouveau");
      again.type = "button";
      again.addEventListener("click", function () { again.textContent = "Vérification…"; chrome.runtime.sendMessage({ type: "UCA_FORCE_UPDATE_CHECK" }); setTimeout(function () { again.textContent = "Vérifier à nouveau"; evaluate(); }, 3500); });
      box.append(h, p, v, btn, status, cmdBox, how, link, again);
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

    // La version a avancé après le téléchargement du pilote : il a été lancé, donc installé. La prochaine fois on le lance directement.
    chrome.storage.local.get("uca_pilot_pending", function (d) {
      if (d.uca_pilot_pending && cmp(CURRENT, d.uca_pilot_pending) > 0) { chrome.storage.local.set({ uca_pilot_ok: true }); chrome.storage.local.remove("uca_pilot_pending"); }
    });
    evaluate();
    chrome.storage.onChanged.addListener(function (c, area) { if (area === "local" && (c.uca_latest_version || c.uca_store_build || c.uca_update_available)) evaluate(); });
    ["pageshow", "focus", "visibilitychange"].forEach(function (ev) { window.addEventListener(ev, evaluate); document.addEventListener(ev, evaluate); });
    // Retrait de la fenêtre ou de l'attribut inert par un script / les outils de développement : remis aussitôt.
    new MutationObserver(function () { if (gate) enforce(); }).observe(document.body, { childList: true });
    setInterval(function () { if (gate) enforce(); }, 1500);
  });
})();
