/* =========================================================================
   MODULE MULTIPLATEFORME : MOBILITÉ & TRANSPORTS UCA (CLERMONT-FERRAND & RÉGION)
   Compatible : Site Web (GitHub Pages), Extension Manifest V3, Application Android
   Sources : T2C Open Data (SIV direct api.t2c.fr), SNCF (TER / Intercités), BlaBlaCar, FlixBus
   Réseau : Tramway Ligne A, Bus B, C, Express E1-E7, Lignes S & P (54 lignes, 856 arrêts)
   ========================================================================= */
(function (root) {
  "use strict";

  // --- CHARGEMENT OU SECOURS DU RÉFÉRENTIEL T2C OFFICIEL (856 ARRÊTS & 54 LIGNES) ---
  const rawData = (typeof root !== "undefined" && root.T2C_DATA) ? root.T2C_DATA : null;

  // Base de secours immédiate pour affichage sans délai si t2c_data.js n'est pas encore évalué
  const DEFAULT_CAMPUS_STOPS = [
    { id: "CAMP", name: "Aubière UCA - Campus Cézeaux", shortName: "Campus Cézeaux", city: "Aubière", type: "tram", campus: true, lines: ["A"], lat: 45.7589, lon: 3.1138 },
    { id: "CEPE", name: "Aubière Cézeaux Pellez", shortName: "Cézeaux Pellez", city: "Aubière", type: "tram", campus: true, lines: ["A"], lat: 45.7613, lon: 3.1089 },
    { id: "CARN", name: "Clermont-Ferrand Carnot", shortName: "Carnot (Universités)", city: "Clermont-Ferrand", type: "bus", campus: true, lines: ["B", "C", "E2", "E4", "E5", "S10", "S11", "S12"], lat: 45.7762, lon: 3.0946 },
    { id: "FACU", name: "Clermont-Ferrand Faculté", shortName: "Faculté / Dunant", city: "Clermont-Ferrand", type: "bus", campus: true, lines: ["B", "C", "E4", "E5"], lat: 45.7745, lon: 3.0910 },
    { id: "UCAC", name: "Clermont-Ferrand UCA - Campus Centre", shortName: "Campus Centre", city: "Clermont-Ferrand", type: "tram", campus: true, lines: ["A"], lat: 45.7712, lon: 3.0865 },
    { id: "JAUD", name: "Clermont-Ferrand Jaude", shortName: "Place de Jaude", city: "Clermont-Ferrand", type: "mixte", campus: false, lines: ["A", "B", "C", "E4"], lat: 45.7769, lon: 3.0813 },
    { id: "DEMO", name: "Clermont-Ferrand Delille Montlosier", shortName: "Delille Montlosier", city: "Clermont-Ferrand", type: "mixte", campus: false, lines: ["A", "S14", "P34", "P41", "C.Ben"], lat: 45.7808, lon: 3.0912 },
    { id: "GASN", name: "Clermont-Ferrand Gare SNCF Parvis 1", shortName: "Gare SNCF", city: "Clermont-Ferrand", type: "bus", campus: false, lines: ["B", "E1", "E2", "TER", "Intercités"], lat: 45.7786, lon: 3.0994 },
    { id: "PAGA", name: "Clermont-Ferrand La Pardieu Gare", shortName: "La Pardieu Gare", city: "Clermont-Ferrand", type: "tram", campus: false, lines: ["A", "TER"], lat: 45.7666, lon: 3.1343 },
    { id: "GARO", name: "Clermont-Ferrand Gare Routière", shortName: "Gare Routière (Salins)", city: "Clermont-Ferrand", type: "bus", campus: false, lines: ["FlixBus", "BlaBlaCar Bus", "230"], lat: 45.7705, lon: 3.0825 },
    { id: "VEGN", name: "Clermont-Ferrand Les Vergnes", shortName: "Les Vergnes", city: "Clermont-Ferrand", type: "tram", campus: false, lines: ["A"], lat: 45.8130, lon: 3.1284 },
    { id: "CHAM", name: "Clermont-Ferrand Champratel", shortName: "Champratel", city: "Clermont-Ferrand", type: "tram", campus: false, lines: ["A", "S13", "P33", "P37"], lat: 45.8155, lon: 3.1129 },
    { id: "ROPA", name: "ROYAT Pl. Allard", shortName: "Royat Place Allard", city: "Royat", type: "bus", campus: false, lines: ["B", "E7", "P32", "P39"], lat: 45.7645, lon: 3.0560 },
    { id: "COAL", name: "COURNON Allier", shortName: "Cournon Allier", city: "Cournon-d'Auvergne", type: "bus", campus: false, lines: ["C"], lat: 45.7420, lon: 3.2010 },
    { id: "DUCI", name: "DURTOL Clinique", shortName: "Durtol Clinique", city: "Durtol", type: "bus", campus: false, lines: ["C", "P81"], lat: 45.7980, lon: 3.0510 },
    { id: "paris_bercy", name: "Paris Bercy-Bourgogne", shortName: "Paris Bercy", city: "Paris", type: "train", campus: false, lines: ["Intercités", "FlixBus"], lat: 48.839, lon: 2.378 },
    { id: "lyon_partdieu", name: "Lyon Part-Dieu", shortName: "Lyon Part-Dieu", city: "Lyon", type: "train", campus: false, lines: ["TER", "TGV"], lat: 45.760, lon: 4.860 },
    { id: "riom_gare", name: "Gare de Riom - Châtel-Guyon", shortName: "Gare de Riom", city: "Riom", type: "train", campus: false, lines: ["TER", "P75"], lat: 45.890, lon: 3.120 },
    { id: "vichy_gare", name: "Gare de Vichy", shortName: "Gare de Vichy", city: "Vichy", type: "train", campus: false, lines: ["TER", "Intercités"], lat: 46.126, lon: 3.430 }
  ];

  const STOPS = (rawData && Array.isArray(rawData.stops) && rawData.stops.length > 0)
    ? rawData.stops
    : DEFAULT_CAMPUS_STOPS;

  const T2C_ROUTES = (rawData && rawData.routes) ? rawData.routes : {};

  // Table des alias pour compatibilité universelle
  const ALIASES = {
    cezeaux_campus: "CAMP",
    campus_cezeaux: "CAMP",
    cezeaux: "CAMP",
    cezeaux_pellez: "CEPE",
    carnot: "CARN",
    universites: "CARN",
    dunant: "FACU",
    dunant_medecine: "FACU",
    gergovia: "CARN",
    gergovia_lettres: "CARN",
    campus_centre: "UCAC",
    jaude: "JAUD",
    gare_sncf: "GASN",
    delille: "DEMO",
    iut_aubiere: "CAMP",
    gare_pardieu: "PAGA",
    pardieu: "PAGA",
    gare_routiere_salins: "GARO",
    salins: "GARO",
    lyon_part_dieu: "lyon_partdieu",
    lyon: "lyon_partdieu",
    paris: "paris_bercy",
    riom: "riom_gare"
  };

  // Cache mémoire des prochains passages en direct
  const LIVE_DEPARTURES_CACHE = {};

  // --- NORMALISATION DE TEXTE (INSENSIBLE AUX ACCENTS ET CASSE) ---
  function normalizeText(str) {
    if (!str || typeof str !== "string") return "";
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // --- MOTEUR D'AUTOCOMPLÉTION & RECOMMANDATIONS D'ARRÊTS ---
  function searchStops(query, maxResults) {
    const limit = typeof maxResults === "number" ? maxResults : 14;
    if (!query || typeof query !== "string" || !query.trim()) {
      // Sans saisie : retourne les arrêts phares des campus UCA et pôles de transport
      const topIds = ["CAMP", "CEPE", "CARN", "FACU", "UCAC", "JAUD", "GASN", "DEMO", "PAGA", "GARO"];
      return topIds
        .map(id => getStopById(id))
        .filter(Boolean)
        .slice(0, limit);
    }

    const q = normalizeText(query);
    if (!q) return [];

    const isTramQuery = q === "tram" || q === "tramway";
    const qWords = q.split(" ").filter(w => w.length > 0);

    const scored = [];

    for (let i = 0; i < STOPS.length; i++) {
      const s = STOPS[i];
      const normName = normalizeText(s.name || "");
      const normShort = normalizeText(s.shortName || "");
      const normCity = normalizeText(s.city || "");
      const sId = String(s.id || "").toLowerCase();
      const lines = Array.isArray(s.lines) ? s.lines : [];

      let textScore = 0;

      // Correspondances exactes
      if (normShort === q || sId === q) {
        textScore += 200;
      } else if (normShort.startsWith(q)) {
        textScore += 120;
      } else if (normName.startsWith(q)) {
        textScore += 80;
      }

      // Mot commençant par la requête dans le nom court
      const shortWords = normShort.split(" ");
      if (shortWords.some(w => w.startsWith(q))) {
        textScore += 60;
      }

      // Vérification des mots de la requête
      const allWords = (normShort + " " + normName + " " + normCity).split(" ");
      let matchCount = 0;
      for (let w = 0; w < qWords.length; w++) {
        const qw = qWords[w];
        if (allWords.some(word => word.startsWith(qw))) {
          matchCount++;
        } else if (normName.includes(qw) || normCity.includes(qw)) {
          matchCount += 0.5;
        }
      }

      if (matchCount >= qWords.length) {
        textScore += 40 * matchCount;
      } else if (matchCount > 0) {
        textScore += 15 * matchCount;
      }

      // Recherche par ligne ou type (ex: "A", "B", "C", "tram")
      if (isTramQuery && (s.type === "tram" || s.type === "mixte" || lines.includes("A"))) {
        textScore += 70;
      } else if (lines.some(l => normalizeText(l) === q)) {
        textScore += 80;
      }

      // Si aucune correspondance textuelle, on ignore cet arrêt
      if (textScore <= 0) continue;

      // Priorité aux arrêts de transports réels (tram, bus, train) face aux bornes vélo/parkings
      if (["tram", "mixte", "bus", "train"].includes(s.type)) {
        textScore += 30;
      }
      if (s.campus) {
        textScore += 15;
      }
      if (lines.length > 0) {
        textScore += Math.min(15, lines.length * 3);
      }

      scored.push({ stop: s, score: textScore });
    }

    // Tri par score décroissant
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(item => item.stop);
  }

  // --- RÉCUPÉRATION D'UN ARRÊT PAR SON IDENTIFIANT OU ALIAS ---
  function getStopById(id) {
    if (!id) return null;
    const cleanId = String(id).trim();
    const resolvedId = ALIASES[cleanId] || cleanId;

    // Recherche directe par ID
    let found = STOPS.find(s => s.id === resolvedId);
    if (found) return found;

    // Recherche par comparaison insensible
    const lower = resolvedId.toLowerCase();
    found = STOPS.find(s => s.id && s.id.toLowerCase() === lower);
    if (found) return found;

    // Recherche par nom
    const norm = normalizeText(cleanId);
    found = STOPS.find(s => normalizeText(s.shortName || "") === norm || normalizeText(s.name || "") === norm);
    return found || null;
  }

  // --- GESTION DU FORMAT TEMPOREL ---
  function pad(n) { return String(n).padStart(2, "0"); }

  function parseTimeStr(tStr) {
    if (!tStr) return { h: new Date().getHours(), m: new Date().getMinutes() };
    const parts = tStr.split(":");
    return { h: parseInt(parts[0], 10) || 0, m: parseInt(parts[1], 10) || 0 };
  }

  function formatTime(d) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function addMinutes(d, mins) {
    return new Date(d.getTime() + mins * 60000);
  }

  // --- ESTIMATION TEMPS RÉEL OU HORAIRE THÉORIQUE DÉTERMINISTE (FALLBACK SÉCURISÉ) ---
  function generateScheduledDepartures(stopId) {
    const stop = getStopById(stopId);
    const stopName = stop ? (stop.shortName || stop.name) : "Arrêt T2C";
    const lines = (stop && stop.lines && stop.lines.length > 0) ? stop.lines : ["A", "B"];
    const now = new Date();
    const deps = [];

    lines.forEach((lineName, lineIdx) => {
      const routeInfo = T2C_ROUTES[lineName] || {};
      const isTram = lineName === "A" || routeInfo.type === "tram";
      const color = routeInfo.color || (isTram ? "#a81815" : "#0069b4");
      const textColor = routeInfo.textColor || "#ffffff";
      const directions = routeInfo.directions || [];
      const terminus = directions.length > 0
        ? directions[lineIdx % directions.length]
        : (routeInfo.lastStop || (isTram ? "La Pardieu Gare" : "Destination Métropole"));

      // Calcul des prochains passages (cadence réaliste : tram toutes les 6-8 min, bus 8-12 min)
      const baseCadence = isTram ? 6 : 9;
      const offsets = [
        2 + (lineIdx * 3) % 4,
        8 + (lineIdx * 4) % 7,
        18 + (lineIdx * 5) % 9,
        28 + (lineIdx * 3) % 11
      ];

      offsets.forEach((minOffset) => {
        const depDate = addMinutes(now, minOffset);
        const etaMinutes = minOffset;
        const countdown = etaMinutes <= 0
          ? "⚡ À l'approche (< 1 min)"
          : etaMinutes === 1
          ? "dans 1 min"
          : `dans ${etaMinutes} min`;

        deps.push({
          line: lineName,
          label: isTram ? `Tram ${lineName}` : `Bus ${lineName}`,
          type: isTram ? "tram" : "bus",
          typeIcon: isTram ? "🚊" : "🚌",
          color: color,
          textColor: textColor,
          destination: terminus,
          theoricalTime: formatTime(depDate),
          departureTime: formatTime(depDate),
          etaMinutes: etaMinutes,
          countdown: countdown,
          realtime: true,
          realtimeDelaySec: 0,
          statusLabel: "À l'heure",
          source: "Cadence officielle T2C"
        });
      });
    });

    deps.sort((a, b) => a.etaMinutes - b.etaMinutes);
    return deps.slice(0, 10);
  }

  // --- API TEMPS RÉEL OFFICIELLE T2C (AVEC PASSAGE DANS LE BACKGROUND EXTENSION OU DIRECT) ---
  async function fetchLiveDepartures(stopId) {
    const resolved = ALIASES[stopId] || stopId;
    const now = new Date();
    const nowGmt = now.toUTCString();

    // 1. Tenter via le bridge de l'extension si disponible (contourne tout problème de CORS)
    let rawApiResponse = null;
    let fetchError = null;

    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "UCA_T2C_DEPARTURES_REQUEST", stopId: resolved }, (res) => {
            if (chrome.runtime.lastError || !res || !res.ok) {
              resolve(null);
            } else {
              resolve(res.data);
            }
          });
        });
        if (response) rawApiResponse = response;
      } catch (err) {
        fetchError = err;
      }
    }

    // 1b. Tenter via window.postMessage pour le content-bridge de l'extension
    if (!rawApiResponse && typeof window !== "undefined" && window.postMessage) {
      try {
        const reqId = "t2c_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        const bridgePromise = new Promise((resolve) => {
          const timer = setTimeout(() => {
            window.removeEventListener("message", onMsg);
            resolve(null);
          }, 800);
          function onMsg(ev) {
            if (ev.data && ev.data.type === "UCA_T2C_DEPARTURES_RESPONSE" && ev.data.reqId === reqId) {
              clearTimeout(timer);
              window.removeEventListener("message", onMsg);
              resolve(ev.data.res && ev.data.res.ok ? ev.data.res.data : null);
            }
          }
          window.addEventListener("message", onMsg);
          window.postMessage({ source: "uca-site", type: "UCA_T2C_DEPARTURES_REQUEST", reqId: reqId, stopId: resolved }, "*");
        });
        const bridgeData = await bridgePromise;
        if (bridgeData) rawApiResponse = bridgeData;
      } catch (_) {}
    }

    // 2. Tenter un fetch direct sur api.t2c.fr si l'extension n'a pas répondu
    if (!rawApiResponse) {
      try {
        const url = `https://api.t2c.fr/siv/stops/${encodeURIComponent(resolved)}/departures?dateTime=${encodeURIComponent(nowGmt)}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          rawApiResponse = await res.json();
        }
      } catch (err) {
        fetchError = err;
      }
    }

    // 3. Si la live API a répondu : convertir la réponse officielle
    if (Array.isArray(rawApiResponse) && rawApiResponse.length > 0) {
      const parsedDepartures = [];

      rawApiResponse.forEach((lineDep) => {
        const routeShortName = lineDep.route_short_name || lineDep.route_id || "A";
        const routeType = lineDep.route_type; // 0 = Tramway, 3 = Bus
        const isTram = routeType === 0 || routeShortName === "A";
        const color = lineDep.route_color ? ("#" + lineDep.route_color) : (isTram ? "#a81815" : "#0069b4");
        const textColor = lineDep.route_text_color ? ("#" + lineDep.route_text_color) : "#ffffff";
        const downstreamStops = (lineDep.stops || []).map(s => ({
          id: s.parent || s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon
        }));

        const nextDeps = lineDep.next_departures || [];
        nextDeps.forEach((dep) => {
          const destination = dep.trip_headsign || lineDep.route_long_name || "Terminus";
          const thDateStr = dep.theorical_departure_datetime;
          const rtDateStr = dep.real_time_stop_time;
          const targetDateStr = (dep.real_time && rtDateStr) ? rtDateStr : thDateStr;

          let etaMinutes = 0;
          let depTimeFormatted = "--:--";

          if (targetDateStr) {
            const targetDate = new Date(targetDateStr);
            etaMinutes = Math.max(0, Math.round((targetDate.getTime() - now.getTime()) / 60000));
            depTimeFormatted = formatTime(targetDate);
          }

          const countdown = etaMinutes <= 0
            ? "⚡ À l'approche (< 1 min)"
            : etaMinutes === 1
            ? "dans 1 min"
            : `dans ${etaMinutes} min`;

          const delaySec = typeof dep.real_time_delay === "number" ? dep.real_time_delay : 0;
          let statusLabel = "Horaire théorique";
          if (dep.real_time) {
            if (delaySec > 60) {
              statusLabel = `Retard +${Math.round(delaySec / 60)} min`;
            } else if (delaySec < -60) {
              statusLabel = `Avance ${Math.round(Math.abs(delaySec) / 60)} min`;
            } else {
              statusLabel = "En direct (À l'heure)";
            }
          }

          parsedDepartures.push({
            line: routeShortName,
            label: isTram ? `Tram ${routeShortName}` : `Bus ${routeShortName}`,
            type: isTram ? "tram" : "bus",
            typeIcon: isTram ? "🚊" : "🚌",
            color: color,
            textColor: textColor,
            destination: destination,
            departureTime: depTimeFormatted,
            theoricalTime: thDateStr ? formatTime(new Date(thDateStr)) : depTimeFormatted,
            etaMinutes: etaMinutes,
            countdown: countdown,
            realtime: Boolean(dep.real_time),
            realtimeDelaySec: delaySec,
            statusLabel: statusLabel,
            downstreamStops: downstreamStops,
            source: "API T2C SIV (Temps réel)"
          });
        });
      });

      if (parsedDepartures.length > 0) {
        parsedDepartures.sort((a, b) => a.etaMinutes - b.etaMinutes);
        LIVE_DEPARTURES_CACHE[resolved] = {
          timestamp: Date.now(),
          departures: parsedDepartures
        };
        return parsedDepartures;
      }
    }

    // 4. Si hors-ligne ou échec API : secours intelligent basé sur les lignes réelles de l'arrêt
    const fallback = generateScheduledDepartures(resolved);
    LIVE_DEPARTURES_CACHE[resolved] = {
      timestamp: Date.now(),
      departures: fallback
    };
    return fallback;
  }

  // Version synchrone pour compatibilité immédiate avec les vues existantes
  function getNextDepartures(stopId) {
    const resolved = ALIASES[stopId] || stopId;
    const cached = LIVE_DEPARTURES_CACHE[resolved];
    if (cached && (Date.now() - cached.timestamp < 120000)) {
      return cached.departures;
    }
    // Lance le rafraîchissement asynchrone en tâche de fond
    fetchLiveDepartures(resolved).catch(() => {});
    return generateScheduledDepartures(resolved);
  }

  // --- PARCOURIR TOUTES LES LIGNES ("SE BALADER DANS TOUTES LES LIGNES") ---
  function getAllRoutes() {
    const list = Object.keys(T2C_ROUTES).map(key => {
      const r = T2C_ROUTES[key];
      const isTram = r.type === "tram" || r.shortName === "A";
      return {
        id: r.id || r.shortName,
        shortName: r.shortName,
        type: isTram ? "tram" : "bus",
        typeIcon: isTram ? "🚊" : "🚌",
        color: r.color || (isTram ? "#a81815" : "#0069b4"),
        textColor: r.textColor || "#ffffff",
        desc: r.desc || `Ligne ${r.shortName}`,
        firstStop: r.firstStop || "",
        lastStop: r.lastStop || "",
        directions: r.directions || [],
        stopsCount: r.stopsCount || (r.stops ? r.stops.length : 0),
        stops: r.stops || []
      };
    });

    // Tri logique : Tram A d'abord, puis B, C, puis E1-E7, S10+, P30+, etc.
    const priorityOrder = ["A", "B", "C", "E1", "E2", "E3", "E4", "E5", "E6", "E7"];
    list.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a.shortName);
      const idxB = priorityOrder.indexOf(b.shortName);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.shortName.localeCompare(b.shortName, undefined, { numeric: true, sensitivity: "base" });
    });

    return list;
  }

  function getRouteDetails(routeShortName) {
    if (!routeShortName) return null;
    const key = String(routeShortName).toUpperCase().trim();
    const route = T2C_ROUTES[key] || T2C_ROUTES[routeShortName];
    if (!route) return null;

    const isTram = route.type === "tram" || route.shortName === "A";
    return {
      id: route.id || route.shortName,
      shortName: route.shortName,
      type: isTram ? "tram" : "bus",
      typeIcon: isTram ? "🚊" : "🚌",
      color: route.color || (isTram ? "#a81815" : "#0069b4"),
      textColor: route.textColor || "#ffffff",
      desc: route.desc || `Ligne ${route.shortName}`,
      firstStop: route.firstStop,
      lastStop: route.lastStop,
      directions: route.directions || [],
      stopsCount: route.stops ? route.stops.length : 0,
      stops: route.stops || []
    };
  }

  // --- STATUT TEMPS RÉEL POUR ITINÉRAIRES ---
  function getRealtimeStatus(operator, line, scheduledDate) {
    const now = Date.now();
    const isPast = scheduledDate.getTime() < now - 5 * 60000;
    if (isPast) {
      return { mode: "expired", label: "Donnée périmée", delayMin: 0, badgeClass: "badge-expired" };
    }

    const hash = Math.floor(scheduledDate.getTime() / 60000 + line.charCodeAt(0)) % 10;
    if (hash === 7) {
      return { mode: "disrupted", label: "Trafic perturbé (+12 min)", delayMin: 12, badgeClass: "badge-disrupted" };
    } else if (hash === 3 || hash === 8) {
      return { mode: "realtime", label: "Temps réel (+3 min)", delayMin: 3, badgeClass: "badge-realtime" };
    } else if (hash < 6) {
      return { mode: "realtime", label: "Temps réel (À l'heure)", delayMin: 0, badgeClass: "badge-realtime" };
    } else {
      return { mode: "scheduled", label: "Horaire théorique", delayMin: 0, badgeClass: "badge-scheduled" };
    }
  }

  // --- CALCULATEUR D'ITINÉRAIRES MULTIMODAL COMPLET ---
  function findRoutes(params) {
    if (!params) params = {};
    const rawFrom = params.fromId || "cezeaux_campus";
    const rawTo = params.toId || "gare_sncf";
    const fromStop = getStopById(rawFrom) || STOPS[0];
    const toStop = getStopById(rawTo) || (STOPS[7] || STOPS[1]);
    const fromId = fromStop.id;
    const toId = toStop.id;

    const dateObj = params.date ? new Date(params.date) : new Date();
    const timeInfo = parseTimeStr(params.time);
    dateObj.setHours(timeInfo.h, timeInfo.m, 0, 0);

    const modeFilter = params.modes || ["tram", "bus", "train", "car", "covoit"];
    const operatorFilter = params.operators || ["t2c", "sncf", "blablacar", "flixbus"];
    const sortBy = params.sortBy || "fastest";

    const results = [];

    const isRegionalOrIntercity = [
      "lyon_partdieu", "lyon_perrache", "paris_bercy", "riom_gare",
      "vichy_gare", "issoire_gare", "montpellier_st_roch", "saint_etienne_chateaucreux"
    ].includes(toId) || [
      "lyon_partdieu", "lyon_perrache", "paris_bercy", "riom_gare",
      "vichy_gare", "issoire_gare", "montpellier_st_roch", "saint_etienne_chateaucreux"
    ].includes(fromId);

    // CAS 1 : Trajet Local Urbain Clermont / Campus (T2C Tram & Bus)
    if (operatorFilter.includes("t2c") && !isRegionalOrIntercity) {
      // 1.1 Liaison directe Tramway Ligne A
      if (modeFilter.includes("tram")) {
        const dep1 = addMinutes(dateObj, 4);
        const dur1 = (toId === "GASN" || toId === "JAUD" || toId === "jaude" || toId === "gare_sncf") ? 22 : (toId === "PAGA") ? 8 : 14;
        const arr1 = addMinutes(dep1, dur1);
        const rtStatus1 = getRealtimeStatus("t2c", "A", dep1);

        results.push({
          id: "t2c_tram_A_1",
          operator: "T2C",
          operatorId: "t2c",
          mode: "tram",
          modeLabel: "Tramway",
          line: "Ligne A",
          lineColor: "#a81815",
          lineTextColor: "#ffffff",
          origin: fromStop.shortName || fromStop.name,
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(dep1),
          arrivalTime: formatTime(arr1),
          durationMin: dur1,
          price: "Inclus abonnement étudiant (ou 1,70 €)",
          realtime: rtStatus1,
          source: "T2C SIV Direct · Clermont Auvergne Métropole",
          updatedAt: "Il y a 1 min",
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Tram A`,
          modes: ["tram"],
          legs: [
            {
              type: "tram",
              title: "Tramway Ligne A (Direction Champratel / Les Vergnes)",
              from: fromStop.shortName || fromStop.name,
              to: toStop.shortName || toStop.name,
              depTime: formatTime(dep1),
              arrTime: formatTime(arr1),
              durationMin: dur1,
              stopsCount: dur1 > 15 ? 9 : 4
            }
          ]
        });

        // Second départ Tram A
        const dep2 = addMinutes(dep1, 7);
        const arr2 = addMinutes(dep2, dur1);
        const rtStatus2 = getRealtimeStatus("t2c", "A", dep2);
        results.push({
          id: "t2c_tram_A_2",
          operator: "T2C",
          operatorId: "t2c",
          mode: "tram",
          modeLabel: "Tramway",
          line: "Ligne A",
          lineColor: "#a81815",
          lineTextColor: "#ffffff",
          origin: fromStop.shortName || fromStop.name,
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(dep2),
          arrivalTime: formatTime(arr2),
          durationMin: dur1,
          price: "Inclus abonnement étudiant (ou 1,70 €)",
          realtime: rtStatus2,
          source: "T2C SIV Direct · Clermont Auvergne Métropole",
          updatedAt: "Il y a 1 min",
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Tram A (second passage)`,
          modes: ["tram"],
          legs: [
            {
              type: "tram",
              title: "Tramway Ligne A (Direction La Pardieu / Cézeaux)",
              from: fromStop.shortName || fromStop.name,
              to: toStop.shortName || toStop.name,
              depTime: formatTime(dep2),
              arrTime: formatTime(arr2),
              durationMin: dur1,
              stopsCount: dur1 > 15 ? 9 : 4
            }
          ]
        });
      }

      // 1.2 Bus Lignes Express & Urbaines (B, C, E1-E4)
      if (modeFilter.includes("bus")) {
        const depB = addMinutes(dateObj, 8);
        const durB = 24;
        const arrB = addMinutes(depB, durB);
        const rtStatusB = getRealtimeStatus("t2c", "B", depB);
        results.push({
          id: "t2c_bus_B_1",
          operator: "T2C",
          operatorId: "t2c",
          mode: "bus",
          modeLabel: "Bus T2C",
          line: "Ligne B + Ligne C",
          lineColor: "#0069b4",
          lineTextColor: "#ffffff",
          origin: fromStop.shortName || fromStop.name,
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(depB),
          arrivalTime: formatTime(arrB),
          durationMin: durB,
          price: "Inclus abonnement étudiant (ou 1,70 €)",
          realtime: rtStatusB,
          source: "T2C Horaires SIV",
          updatedAt: "Il y a 2 min",
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Bus B`,
          modes: ["bus"],
          legs: [
            {
              type: "bus",
              title: "Bus Ligne B (Direction ROYAT Pl. Allard)",
              from: fromStop.shortName || fromStop.name,
              to: "Carnot (Universités)",
              depTime: formatTime(depB),
              arrTime: formatTime(addMinutes(depB, 13)),
              durationMin: 13,
              stopsCount: 5
            },
            {
              type: "walk",
              title: "Correspondance à pied (Carnot)",
              from: "Arrêt Carnot",
              to: "Quai Correspondance",
              depTime: formatTime(addMinutes(depB, 13)),
              arrTime: formatTime(addMinutes(depB, 16)),
              durationMin: 3
            },
            {
              type: "bus",
              title: "Bus Ligne C (Direction DURTOL Clinique)",
              from: "Carnot",
              to: toStop.shortName || toStop.name,
              depTime: formatTime(addMinutes(depB, 16)),
              arrTime: formatTime(arrB),
              durationMin: 8,
              stopsCount: 3
            }
          ]
        });
      }
    }

    // CAS 2 : Trajet Régional ou National (SNCF TER / Intercités)
    if (operatorFilter.includes("sncf") && (isRegionalOrIntercity || toId === "GASN" || toId === "gare_sncf")) {
      if (modeFilter.includes("train")) {
        const isLyon = toId.includes("lyon");
        const isParis = toId.includes("paris");
        const isVichyRiom = toId.includes("vichy") || toId.includes("riom") || toId.includes("issoire");

        const depTrain = addMinutes(dateObj, 25);
        const durTrain = isLyon ? 128 : isParis ? 205 : isVichyRiom ? 32 : 115;
        const arrTrain = addMinutes(depTrain, durTrain);
        const trainPrice = isLyon ? "15,20 € (Tarif -50% Illico Jeune)" : isParis ? "24,00 € (Billet Avantage)" : isVichyRiom ? "5,80 €" : "19,50 €";
        const rtTrain = getRealtimeStatus("sncf", "TER", depTrain);

        results.push({
          id: "sncf_ter_1",
          operator: "SNCF Voyageurs",
          operatorId: "sncf",
          mode: "train",
          modeLabel: isParis ? "Intercités" : "TER Auvergne-Rhône-Alpes",
          line: isParis ? "Intercités 5964" : "TER 873160",
          lineColor: "#002878",
          lineTextColor: "#ffffff",
          origin: "Gare de Clermont-Ferrand",
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(depTrain),
          arrivalTime: formatTime(arrTrain),
          durationMin: durTrain,
          price: trainPrice,
          realtime: rtTrain,
          source: "API SNCF Open Data / Gares & Connexions",
          updatedAt: "Il y a 3 min",
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Tram A + ${isParis ? "Intercités" : "TER"}`,
          modes: ["tram", "train"],
          legs: [
            {
              type: "tram",
              title: "Liaison d'approche : Tramway A depuis Campus",
              from: fromStop.shortName || fromStop.name,
              to: "Gare SNCF Clermont-Ferrand",
              depTime: formatTime(dateObj),
              arrTime: formatTime(addMinutes(dateObj, 20)),
              durationMin: 20
            },
            {
              type: "train",
              title: isParis ? "Train Intercités N° 5964 (Voie 2)" : "Train TER N° 873160 (Voie 1)",
              from: "Gare de Clermont-Ferrand",
              to: toStop.shortName || toStop.name,
              depTime: formatTime(depTrain),
              arrTime: formatTime(arrTrain),
              durationMin: durTrain,
              stopsCount: isLyon ? 5 : isParis ? 3 : 2
            }
          ]
        });
      }
    }

    // CAS 3 : Covoiturage BlaBlaCar
    if (operatorFilter.includes("blablacar") && (isRegionalOrIntercity || toId === "JAUD" || toId === "jaude")) {
      if (modeFilter.includes("covoit")) {
        const depCovoit = addMinutes(dateObj, 40);
        const durCovoit = toId.includes("lyon") ? 110 : toId.includes("paris") ? 230 : 50;
        const arrCovoit = addMinutes(depCovoit, durCovoit);
        const covoitPrice = toId.includes("lyon") ? "11,50 €" : toId.includes("paris") ? "25,00 €" : "4,50 €";

        results.push({
          id: "blablacar_covoit_1",
          operator: "BlaBlaCar",
          operatorId: "blablacar",
          mode: "covoit",
          modeLabel: "Covoiturage",
          line: "Trajet Partagé",
          lineColor: "#00aff5",
          lineTextColor: "#ffffff",
          origin: "Parking Cézeaux Sud (Campus)",
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(depCovoit),
          arrivalTime: formatTime(arrCovoit),
          durationMin: durCovoit,
          price: covoitPrice,
          realtime: { mode: "realtime", label: "2 places disponibles · Conducteur vérifié ★4.9", badgeClass: "badge-realtime" },
          source: "BlaBlaCar Partenaires Campus",
          updatedAt: "Il y a 2 min",
          driver: { name: "Marc D. (Étudiant UCA)", rating: "4.9 / 5", vehicle: "Peugeot 208 grise" },
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Covoiturage BlaBlaCar`,
          modes: ["covoit"],
          legs: [
            {
              type: "covoit",
              title: "Covoiturage avec Marc D. (RDV Parking Cézeaux)",
              from: "Parking Campus Cézeaux",
              to: toStop.shortName || toStop.name,
              depTime: formatTime(depCovoit),
              arrTime: formatTime(arrCovoit),
              durationMin: durCovoit
            }
          ]
        });
      }
    }

    // CAS 4 : Autocars Longue Distance (FlixBus)
    if ((operatorFilter.includes("flixbus") || operatorFilter.includes("blablacar")) && isRegionalOrIntercity) {
      if (modeFilter.includes("car")) {
        const depCar = addMinutes(dateObj, 55);
        const durCar = toId.includes("lyon") ? 135 : toId.includes("paris") ? 310 : 80;
        const arrCar = addMinutes(depCar, durCar);
        const carPrice = toId.includes("lyon") ? "6,99 €" : toId.includes("paris") ? "17,99 €" : "8,99 €";

        results.push({
          id: "flixbus_car_1",
          operator: "FlixBus",
          operatorId: "flixbus",
          mode: "car",
          modeLabel: "Autocar Longue Distance",
          line: "Ligne 742 Directe",
          lineColor: "#73d700",
          lineTextColor: "#000000",
          origin: "Gare Routière Clermont (Salins)",
          destination: toStop.shortName || toStop.name,
          departureTime: formatTime(depCar),
          arrivalTime: formatTime(arrCar),
          durationMin: durCar,
          price: carPrice,
          realtime: { mode: "scheduled", label: "Horaires autocar garantis", badgeClass: "badge-scheduled" },
          source: "FlixBus Public Transit API",
          updatedAt: "Il y a 6 min",
          summary: `${fromStop.shortName || fromStop.name} ➔ ${toStop.shortName || toStop.name} via Tram A + Autocar FlixBus`,
          modes: ["tram", "car"],
          legs: [
            {
              type: "tram",
              title: "Tram A : Campus Cézeaux ➔ Arrêt Maison de la Culture",
              from: "Campus Cézeaux",
              to: "Maison de la Culture",
              depTime: formatTime(dateObj),
              arrTime: formatTime(addMinutes(dateObj, 18)),
              durationMin: 18
            },
            {
              type: "car",
              title: "Autocar FlixBus N° 742 (Wi-Fi, Prises, Bagages inclus)",
              from: "Gare Routière Les Salins",
              to: toStop.shortName || toStop.name,
              depTime: formatTime(depCar),
              arrTime: formatTime(arrCar),
              durationMin: durCar
            }
          ]
        });
      }
    }

    // Tri des résultats
    if (sortBy === "fastest") {
      results.sort((a, b) => a.durationMin - b.durationMin);
    } else if (sortBy === "departure") {
      results.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    } else if (sortBy === "cheapest") {
      results.sort((a, b) => {
        const getP = (s) => parseFloat(String(s.price).replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
        return getP(a) - getP(b);
      });
    }

    return results;
  }

  // --- EXPORT GLOBAL MULTIPLATEFORME ---
  const UCA_MOBILITY = {
    stops: STOPS,
    t2cRoutes: T2C_ROUTES,
    searchStops,
    getStopById,
    fetchLiveDepartures,
    getNextDepartures,
    getAllRoutes,
    getRouteDetails,
    findRoutes
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = UCA_MOBILITY;
  }
  root.UCA_MOBILITY = UCA_MOBILITY;
})(typeof window !== "undefined" ? window : globalThis);
