/* =========================================================================
   MOBILITÉ UCA : arrêts, lignes et prochains passages de bus et tram (Clermont-Ferrand)
   Utilisé par transport.html (site) et sa copie embarquée dans l'application Android.

   Règle unique : AUCUNE DONNÉE INVENTÉE.
     - les arrêts et les lignes viennent de core/t2c_data.js (copie datée, voir generatedAt) ;
     - les passages viennent uniquement de la réponse de api.t2c.fr ;
     - si le serveur ne répond pas, ou répond dans un format inconnu, le résultat est « unavailable ».
   Les textes renvoyés ici viennent du réseau : la page doit les insérer comme du texte, jamais comme du HTML.
   ========================================================================= */
(function (root) {
  "use strict";

  const DATA = (root && root.T2C_DATA) ? root.T2C_DATA : {};
  const STOPS = Array.isArray(DATA.stops) ? DATA.stops : [];
  const ROUTES = DATA.routes || {};

  // Seuls ces types sont des arrêts où passent des bus ou des trams. La copie contient aussi des
  // stations de vélos, des parkings, des points de vente et quelques gares ajoutées à la main :
  // ils n'ont pas de prochains passages ici.
  const TRANSIT_TYPES = ["tram", "mixte", "bus"];
  const TRANSIT_STOPS = STOPS.filter((s) => s && TRANSIT_TYPES.indexOf(s.type) !== -1);

  const REQUEST_TIMEOUT_MS = 8000;
  const BRIDGE_TIMEOUT_MS = 800;       // aucun signe de l'extension : on tente l'appel direct
  const BRIDGE_TIMEOUT_SITE_MS = 5000; // site officiel : une extension plus ancienne répond sans accusé de réception
  const PAST_TOLERANCE_MS = 60000;

  function normalizeText(str) {
    return String(str == null ? "" : str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // --- ARRÊTS ---
  const STOP_BY_ID = new Map();
  TRANSIT_STOPS.forEach((s) => STOP_BY_ID.set(String(s.id).toLowerCase(), s));

  /** Arrêt de bus ou de tram portant cet identifiant, sinon null. Accepte un nombre. */
  function getStopById(id) {
    if (id === null || id === undefined || id === "") return null;
    return STOP_BY_ID.get(String(id).trim().toLowerCase()) || null;
  }

  /** Tous les arrêts de bus et de tram qui correspondent à la recherche, du plus au moins pertinent. */
  function searchStops(query) {
    const q = normalizeText(query);
    if (!q) return [];
    const words = q.split(" ");
    const isTramQuery = q === "tram" || q === "tramway";
    const scored = [];

    TRANSIT_STOPS.forEach((s) => {
      const shortName = normalizeText(s.shortName || s.name);
      const full = normalizeText((s.name || "") + " " + (s.shortName || ""));
      const lines = Array.isArray(s.lines) ? s.lines : [];
      const id = String(s.id).toLowerCase();
      let score = 0;

      if (shortName === q || id === q) score = 500;
      else if (shortName.startsWith(q)) score = 400;
      else if (words.every((w) => full.split(" ").some((part) => part.startsWith(w)))) score = 300;
      else if (q.length >= 3 && words.every((w) => full.indexOf(w) !== -1)) score = 200;
      else if (lines.some((l) => normalizeText(l) === q)) score = 100;
      else if (isTramQuery && s.type !== "bus") score = 100;

      if (!score) return;
      if (s.type !== "bus") score += 20;
      score += Math.min(15, lines.length * 3);
      scored.push({ stop: s, score });
    });

    scored.sort((a, b) => b.score - a.score || String(a.stop.shortName).localeCompare(String(b.stop.shortName), "fr"));
    return scored.map((item) => item.stop);
  }

  // --- COULEURS ---
  const HEX = /^#?([0-9a-f]{6})$/i;

  function luminance(hex) {
    const channel = (i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }

  function contrast(a, b) {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  function hexOrNull(value) {
    const m = typeof value === "string" ? HEX.exec(value.trim()) : null;
    return m ? "#" + m[1].toLowerCase() : null;
  }

  /** Couple fond / texte sûr : seules les couleurs à 6 chiffres sont acceptées, et le texte reste lisible. */
  function safeColors(background, text) {
    const color = hexOrNull(background) || "#475569";
    let textColor = hexOrNull(text) || "#ffffff";
    if (contrast(color, textColor) < 4.5) {
      textColor = contrast(color, "#ffffff") >= contrast(color, "#000000") ? "#ffffff" : "#000000";
    }
    return { color, textColor };
  }

  // --- LIGNES ---
  function describeRoute(key) {
    if (!Object.prototype.hasOwnProperty.call(ROUTES, key)) return null;
    const r = ROUTES[key];
    const colors = safeColors(r.color, r.textColor);
    return {
      shortName: String(r.shortName || key),
      type: r.type === "tram" ? "tram" : "bus",
      color: colors.color,
      textColor: colors.textColor,
      firstStop: r.firstStop || "",
      lastStop: r.lastStop || "",
      directions: Array.isArray(r.directions) ? r.directions.filter(Boolean) : [],
      stops: Array.isArray(r.stops) ? r.stops : []
    };
  }

  const PRIORITY = ["A", "B", "C", "E1", "E2", "E3", "E4", "E5", "E6", "E7"];

  function getAllRoutes() {
    const rank = (name) => (PRIORITY.indexOf(name) === -1 ? PRIORITY.length : PRIORITY.indexOf(name));
    return Object.keys(ROUTES)
      .map(describeRoute)
      .sort((a, b) => rank(a.shortName) - rank(b.shortName) || a.shortName.localeCompare(b.shortName, "fr", { numeric: true }));
  }

  function getRouteDetails(shortName) {
    return describeRoute(String(shortName == null ? "" : shortName));
  }

  // --- PROCHAINS PASSAGES ---
  function text(value, max) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).trim().slice(0, max || 80);
  }

  function parseDate(value) {
    if (typeof value !== "string" || !value) return null;
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }

  /**
   * Convertit la réponse de l'API. Renvoie null si le format n'est pas reconnu : on ne peut alors ni
   * afficher des passages ni affirmer qu'il n'y en a aucun.
   */
  function parseDepartures(raw, now) {
    if (!Array.isArray(raw)) return null;
    if (!raw.length) return [];

    const departures = [];
    let recognised = 0;
    let unreadable = 0;

    raw.forEach((entry) => {
      if (!entry || !Array.isArray(entry.next_departures)) return;
      recognised++;
      const line = text(entry.route_short_name || entry.route_id, 12);
      const known = describeRoute(line);
      let type = entry.route_type === 0 ? "tram" : entry.route_type === 3 ? "bus" : "";
      if (!type && known) type = known.type;
      const colors = safeColors(
        hexOrNull(entry.route_color) || (known && known.color),
        hexOrNull(entry.route_text_color) || (known && known.textColor)
      );

      entry.next_departures.forEach((dep) => {
        if (!dep) { unreadable++; return; }
        const planned = parseDate(dep.theorical_departure_datetime);
        // « En direct » exige les deux : l'indicateur temps réel ET une heure temps réel lisible.
        const flagged = dep.real_time === true || dep.real_time === 1;
        const live = flagged ? parseDate(dep.real_time_stop_time) : null;
        const time = live !== null ? live : planned;
        if (time === null || !line) { unreadable++; return; }
        if (time < now - PAST_TOLERANCE_MS) return;
        departures.push({
          line,
          type,
          color: colors.color,
          textColor: colors.textColor,
          destination: text(dep.trip_headsign) || "Direction non précisée",
          time,
          plannedTime: planned,
          realtime: live !== null
        });
      });
    });

    // Rien à afficher alors qu'une partie de la réponse est illisible : on ne peut pas affirmer « aucun passage ».
    if (!departures.length && (unreadable || recognised < raw.length)) return null;
    departures.sort((a, b) => a.time - b.time);
    return departures;
  }

  /** Regroupe par ligne et direction ; chaque groupe garde au plus `perGroup` passages. */
  function groupDepartures(departures, perGroup) {
    const limit = perGroup || 3;
    const groups = new Map();
    departures.forEach((d) => {
      const key = JSON.stringify([d.line, d.destination]);
      if (!groups.has(key)) {
        groups.set(key, { line: d.line, type: d.type, color: d.color, textColor: d.textColor, destination: d.destination, departures: [] });
      }
      const group = groups.get(key);
      if (group.departures.length < limit) group.departures.push(d);
    });
    return Array.from(groups.values());
  }

  // Dans l'extension : le script d'arrière-plan fait la requête.
  function requestViaRuntime(stopId) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS);
      const done = (value) => { clearTimeout(timer); resolve(value); };
      try {
        chrome.runtime.sendMessage({ type: "UCA_T2C_DEPARTURES_REQUEST", stopId }, (res) => {
          done(!chrome.runtime.lastError && res && res.ok ? res.data : null);
        });
      } catch (_) { done(null); }
    });
  }

  // Sur le site : content-bridge.js (extension) relaie la demande. On n'accepte que les messages de
  // cette même fenêtre, de la même origine et signés par le pont.
  function requestViaBridge(stopId) {
    if (typeof window === "undefined" || !window.postMessage || window.top !== window) return Promise.resolve(null);
    const isFile = window.location.protocol === "file:";
    const reqId = "t2c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    return new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(value);
      };
      const wait = window.location.hostname === "kiricoucou.github.io" ? BRIDGE_TIMEOUT_SITE_MS : BRIDGE_TIMEOUT_MS;
      let timer = setTimeout(() => finish(null), wait);
      function onMessage(ev) {
        if (ev.source !== window) return;
        if (!isFile && ev.origin !== window.location.origin) return;
        const msg = ev.data;
        if (!msg || msg.source !== "uca-extension" || msg.reqId !== reqId) return;
        if (msg.type === "UCA_T2C_DEPARTURES_PENDING") { clearTimeout(timer); timer = setTimeout(() => finish(null), REQUEST_TIMEOUT_MS + 1000); return; }
        if (msg.type !== "UCA_T2C_DEPARTURES_RESPONSE") return;
        finish(msg.res && msg.res.ok ? msg.res.data : null);
      }
      window.addEventListener("message", onMessage);
      window.postMessage({ source: "uca-site", type: "UCA_T2C_DEPARTURES_REQUEST", reqId, stopId }, isFile ? "*" : window.location.origin);
    });
  }

  async function requestDirect(stopId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = "https://api.t2c.fr/siv/stops/" + encodeURIComponent(stopId) +
        "/departures?dateTime=" + encodeURIComponent(new Date().toUTCString());
      const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
      return res.ok ? await res.json() : null;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Prochains passages d'un arrêt. Ne rejette jamais.
   * { state: "ok" | "empty" | "unavailable", departures: [...], fetchedAt: <ms, heure de la tentative terminée> }
   */
  async function fetchDepartures(stopId) {
    const stop = getStopById(stopId);
    let departures = null;
    if (stop) {
      try {
        const id = String(stop.id);
        let raw = await requestViaRuntime(id);
        if (!raw) raw = await requestViaBridge(id);
        if (!raw) raw = await requestDirect(id);
        departures = parseDepartures(raw, Date.now());
      } catch (_) {
        departures = null;
      }
    }
    const state = departures === null ? "unavailable" : departures.length ? "ok" : "empty";
    return { state, departures: departures || [], fetchedAt: Date.now() };
  }

  const UCA_MOBILITY = {
    generatedAt: DATA.generatedAt || "",
    transitStops: TRANSIT_STOPS,
    normalizeText,
    searchStops,
    getStopById,
    getAllRoutes,
    getRouteDetails,
    safeColors,
    parseDepartures,
    groupDepartures,
    fetchDepartures
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = UCA_MOBILITY;
  }
  root.UCA_MOBILITY = UCA_MOBILITY;
})(typeof window !== "undefined" ? window : globalThis);
