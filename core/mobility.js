/* =========================================================================
   MOBILITÉ UCA : arrêts, lignes et prochains passages de bus et tram (Clermont-Ferrand)
   Utilisé par transport.html (site) et sa copie embarquée dans l'application Android.

   Règle unique : AUCUNE DONNÉE INVENTÉE.
     - les arrêts et les lignes viennent de core/t2c_data.js (copie datée, voir generatedAt) ;
     - les passages viennent uniquement des données ouvertes officielles de T2C (core/t2c_open.js) ;
     - sans horaires lisibles, le résultat est « unavailable ».
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

  // --- PROCHAINS PASSAGES (données ouvertes officielles : voir core/t2c_open.js) ---
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

  /**
   * Prochains passages d'un arrêt. Ne rejette jamais.
   * { state: "ok" | "empty" | "unavailable", reason, departures: [...], realtime: bool, fetchedAt: <ms> }
   */
  async function fetchDepartures(stopId) {
    const none = (reason) => ({ state: "unavailable", reason, departures: [], realtime: false, fetchedAt: Date.now() });
    const stop = getStopById(stopId);
    if (!stop) return none("arret");
    if (!root.UCA_T2C_OPEN) return none("reseau");
    try {
      const result = await root.UCA_T2C_OPEN.departures(String(stop.id));
      result.departures = result.departures.map((d) => {
        const line = String(d.line).slice(0, 12), known = describeRoute(line);
        const colors = safeColors(hexOrNull(d.color) || (known && known.color), hexOrNull(d.textColor) || (known && known.textColor));
        return Object.assign({}, d, { line, color: colors.color, textColor: colors.textColor, destination: String(d.destination).slice(0, 80) });
      });
      return result;
    } catch (_) {
      return none("reseau");
    }
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
    groupDepartures,
    fetchDepartures
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = UCA_MOBILITY;
  }
  root.UCA_MOBILITY = UCA_MOBILITY;
})(typeof window !== "undefined" ? window : globalThis);
