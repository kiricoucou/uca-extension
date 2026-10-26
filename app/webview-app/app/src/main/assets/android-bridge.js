/* Pont JS <-> natif Android, équivalent de content-bridge.js côté extension Chrome.
   Injecté après chaque chargement de page dans la WebView principale. */
(function () {
  if (window.__ucaBridgeInstalled) return;
  window.__ucaBridgeInstalled = true;

  window.addEventListener("message", function (ev) {
    if (ev.source !== window) return;
    var data = ev.data;
    if (!data || data.source !== "uca-site") return;
    if (data.type === "UCA_SYNC_REQUEST" && window.AndroidUCA &&
        (data.mode === "resync" || data.mode === "login")) {
      window.AndroidUCA.requestSync(data.mode);
    }
  });

  // Appelé par le natif (MainActivity) pour livrer un message à la page,
  // exactement comme content-bridge.js relaie chrome.runtime.onMessage.
  window.__ucaDeliver = function (json) {
    try {
      var msg = JSON.parse(json);
      window.postMessage(Object.assign({ source: "uca-extension" }, msg), "*");
    } catch (e) { /* ignore */ }
  };

  // Appelé par index.html (render(), voir notifyNativeEvents) à chaque rendu avec
  // la liste de cours affichée. Transmis au natif pour la sync calendrier téléphone
  // et les rappels de cours (sans effet si AndroidUCA.onEventsUpdated n'existe pas).
  window.__ucaOnEvents = function (json) {
    try {
      if (window.AndroidUCA && window.AndroidUCA.onEventsUpdated) {
        window.AndroidUCA.onEventsUpdated(json);
      }
    } catch (e) { /* ignore */ }
  };

  if (window.AndroidUCA) {
    window.postMessage({ source: "uca-extension", type: "UCA_EXTENSION_READY" }, "*");
  }
})();
