/* =========================================================================
   PASSAGES T2C À PARTIR DES DONNÉES OUVERTES OFFICIELLES (Licence Ouverte, transport.data.gouv.fr)
     - horaires prévus : fichiers par arrêt générés chaque jour (branche « gtfs-data » du dépôt) ;
     - temps réel      : flux GTFS-RT officiel, lu directement (il autorise toutes les pages web).
   Aucune donnée inventée : « En direct » = heure présente dans le flux temps réel (récent) ; « Prévu » = horaire
   officiel. Passage annulé ou arrêt non desservi : retiré. Sans horaires lisibles : « unavailable ».
   Seul le code de l'arrêt consulté apparaît dans une requête (nom du fichier d'horaires).
   ========================================================================= */
(function (root) {
  "use strict";

  const DEFAULT_BASES = {
    schedule: "https://raw.githubusercontent.com/kiricoucou/uca-extension/gtfs-data/",
    realtime: "https://proxy.transport.data.gouv.fr/resource/t2c-clermont-gtfs-rt-trip-update"
  };
  const TIMEOUT_MS = 12000;
  const FEED_CACHE_MS = 30000;
  const FEED_MAX_AGE_MS = 5 * 60000;      // flux plus vieux : on n'affiche plus « En direct »
  const META_CACHE_MS = 60 * 60000;
  const WINDOW_AHEAD_MS = 3 * 3600000;
  const LOOK_BACK_MS = 60 * 60000;        // un véhicule très en retard reste affiché
  const PAST_TOLERANCE_MS = 60000;
  const MAX_DEPARTURES = 60;
  const SCHEDULE_MAX_AGE_MS = 30 * 86400000;   // tâche quotidienne arrêtée depuis un mois : horaires à ne plus croire

  const bases = () => Object.assign({}, DEFAULT_BASES, root.UCA_T2C_BASES || {});

  /* ---------- lecture minimale du format protobuf (GTFS-RT) ---------- */
  function reader(bytes) {
    let i = 0;
    const varint = () => {
      let r = 0, m = 1, b;
      do { if (i >= bytes.length) throw new Error("flux tronqué"); b = bytes[i++]; r += (b & 0x7f) * m; m *= 128; } while (b & 0x80);
      return r;
    };
    return {
      each(visit) {
        while (i < bytes.length) {
          const key = varint(), field = Math.floor(key / 8), wire = key % 8;
          if (wire === 0) visit(field, varint());
          else if (wire === 2) { const n = varint(); if (i + n > bytes.length) throw new Error("flux tronqué"); const part = bytes.subarray(i, i + n); i += n; visit(field, part); }
          else if (wire === 5) i += 4;
          else if (wire === 1) i += 8;
          else throw new Error("format inconnu");
        }
      }
    };
  }
  const utf8 = (b) => new TextDecoder("utf-8").decode(b);
  const eachField = (bytes, visit) => reader(bytes).each(visit);
  const eventTime = (bytes) => { let t = null; eachField(bytes, (f, v) => { if (f === 2) t = v * 1000; }); return t; };

  /** { timestamp, canceled: Set, times: Map(clé -> {time, skipped}), bySeq: Map(clé + "|rang" -> idem) } pour les quais demandés.
      clé = "course|AAAAMMJJ" (jour de service) ; "course|" si le flux ne donne pas le jour. */
  function decodeFeed(bytes, platformIds) {
    const out = { timestamp: 0, canceled: new Set(), times: new Map(), bySeq: new Map() };
    eachField(bytes, (f, value) => {
      if (f === 1) eachField(value, (h, v) => { if (h === 3) out.timestamp = v * 1000; });
      if (f !== 2) return;
      eachField(value, (e, tripUpdate) => {
        if (e !== 3) return;
        let tripId = "", day = "", canceled = false; const stops = [];
        eachField(tripUpdate, (u, v) => {
          // relation de la course : 3 = annulée, 7 = supprimée
          if (u === 1) eachField(v, (t, x) => { if (t === 1) tripId = utf8(x); if (t === 3) day = utf8(x); if (t === 4) canceled = x === 3 || x === 7; });
          if (u === 2) stops.push(v);
        });
        if (!tripId) return;
        const key = tripId + "|" + day;
        if (canceled) { out.canceled.add(key); return; }
        stops.forEach((s) => {
          let stopId = "", departure = null, arrival = null, relation = 0, sequence = null;
          eachField(s, (k, v) => {
            if (k === 1) sequence = v;
            if (k === 4) stopId = utf8(v);
            if (k === 2) arrival = eventTime(v);
            if (k === 3) departure = eventTime(v);
            if (k === 5) relation = v;
          });
          if (!platformIds.has(stopId)) return;
          // 1 = arrêt non desservi ; 2 = aucune donnée temps réel (une heure éventuelle ne compte pas)
          const update = { time: relation === 2 ? null : departure !== null ? departure : arrival, skipped: relation === 1 };
          out.times.set(key, update);
          if (sequence !== null) out.bySeq.set(key + "|" + sequence, update);
        });
      });
    });
    return out;
  }

  /* ---------- dates et heures de Paris ---------- */
  const parisParts = (ms) => {
    const p = {};
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return p;
  };
  const dateKey = (ms) => { const p = parisParts(ms); return p.year + p.month + p.day; };
  /** Origine des heures GTFS d'un jour : « midi moins 12 h » à Paris (reste juste les jours de changement d'heure). */
  function serviceOrigin(key) {
    const noonUtc = Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), 12);
    const p = parisParts(noonUtc);
    const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - noonUtc;
    return noonUtc - offset - 12 * 3600000;
  }
  const shiftDay = (key, days) => { const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8) + days)); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
  function runsOn(service, key) {
    if (!service) return false;
    if (service.del.indexOf(key) !== -1) return false;
    if (service.add.indexOf(key) !== -1) return true;
    if (!service.from || key < service.from || key > service.to) return false;
    const day = (new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8))).getUTCDay() + 6) % 7;
    return service.days.charAt(day) === "1";
  }

  /** Passages d'un arrêt entre « maintenant » et dans 3 h, temps réel appliqué quand le flux est fourni. */
  function merge(meta, stopFile, feed, now) {
    const today = dateKey(now), live = !!(feed && now - feed.timestamp < FEED_MAX_AGE_MS);
    const found = [];
    // la veille compte aussi : les courses de nuit y sont notées « 24:10 », « 25:00 »…
    [shiftDay(today, -1), today, shiftDay(today, 1)].forEach((key) => {
      const origin = serviceOrigin(key);
      stopFile.rows.forEach((row) => {
        const planned = origin + row[0] * 1000;
        if (planned < now - LOOK_BACK_MS || planned > now + WINDOW_AHEAD_MS) return;
        const trip = meta.trips[row[1]];
        if (!trip || !runsOn(meta.services[trip[3]], key)) return;
        let time = planned, realtime = false;
        if (live && Math.abs(planned - now) < WINDOW_AHEAD_MS) {
          const dated = trip[0] + "|" + key, undated = trip[0] + "|";
          if (feed.canceled.has(dated) || feed.canceled.has(undated)) return;
          // 3e valeur : la course passe plusieurs fois à cet arrêt (boucle), seul le bon rang compte
          const rt = row.length > 2 ? feed.bySeq.get(dated + "|" + row[2]) || feed.bySeq.get(undated + "|" + row[2]) : feed.times.get(dated) || feed.times.get(undated);
          // même course un autre jour : une heure à plus de 2 h de l'horaire prévu n'est pas la sienne
          if (rt && (rt.time === null || Math.abs(rt.time - planned) < 2 * 3600000)) {
            if (rt.skipped) return;
            if (rt.time !== null) { time = rt.time; realtime = true; }
          }
        }
        if (time < now - PAST_TOLERANCE_MS) return;
        const route = meta.routes[trip[1]] || [trip[1], "bus", "", ""];
        found.push({ line: String(route[0]), type: route[1], color: route[2], textColor: route[3], destination: meta.headsigns[trip[2]] || "Direction non précisée", time, plannedTime: planned, realtime });
      });
    });
    found.sort((a, b) => a.time - b.time);
    return { departures: found.slice(0, MAX_DEPARTURES), realtime: live };
  }

  /* ---------- téléchargements ---------- */
  async function get(url, kind) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: kind === "json" ? "default" : "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) { const e = new Error("HTTP " + res.status); e.status = res.status; throw e; }
      return kind === "json" ? await res.json() : new Uint8Array(await res.arrayBuffer());
    } finally { clearTimeout(timer); }
  }

  let metaCache = null, feedCache = null;
  const stopCache = new Map();
  async function loadMeta(now) {
    if (metaCache && now - metaCache.at < META_CACHE_MS) return metaCache.value;
    const value = await get(bases().schedule + "meta.json", "json");
    if (!value || !Array.isArray(value.trips) || !Array.isArray(value.stops)) throw new Error("horaires illisibles");
    if (!metaCache || metaCache.value.version !== value.version) stopCache.clear();
    metaCache = { at: now, value };
    return value;
  }
  async function loadStop(meta, code) {
    if (stopCache.has(code)) return stopCache.get(code);
    const value = await get(bases().schedule + "stops/" + encodeURIComponent(code) + ".json?v=" + encodeURIComponent(meta.version), "json");
    if (!value || !Array.isArray(value.rows) || !Array.isArray(value.ids)) throw new Error("horaires illisibles");
    // les numéros de course changent d'une version à l'autre : jamais de mélange, on relira meta.json
    if (value.version !== meta.version) { metaCache = null; throw new Error("horaires d'une autre version"); }
    stopCache.set(code, value);
    return value;
  }
  async function loadFeedBytes(now) {
    if (feedCache && now - feedCache.at < FEED_CACHE_MS) return feedCache.bytes;
    const bytes = await get(bases().realtime, "bytes");
    feedCache = { at: now, bytes };
    return bytes;
  }

  /**
   * Ne rejette jamais. { state: "ok"|"empty"|"unavailable", reason, departures, realtime, scheduleDate, validTo, fetchedAt }
   * reason (si unavailable) : "reseau" | "arret" (pas d'horaire officiel pour ce code) | "perime".
   */
  async function departures(code, nowMs) {
    const now = nowMs || Date.now();
    const fail = (reason) => ({ state: "unavailable", reason, departures: [], realtime: false, fetchedAt: Date.now() });
    let meta, stopFile;
    try {
      meta = await loadMeta(now);
      if ((meta.validTo && dateKey(now) > meta.validTo) || (meta.validFrom && dateKey(now) < meta.validFrom)) return fail("perime");
      if (meta.builtAt && now - Date.parse(meta.builtAt) > SCHEDULE_MAX_AGE_MS) return fail("perime");
      if (meta.stops.indexOf(code) === -1) return fail("arret");
      stopFile = await loadStop(meta, code);
    } catch (_) { return fail("reseau"); }
    let feed = null;
    try { feed = decodeFeed(await loadFeedBytes(now), new Set(stopFile.ids)); } catch (_) { feed = null; }
    const m = merge(meta, stopFile, feed, now);
    return { state: m.departures.length ? "ok" : "empty", reason: null, departures: m.departures, realtime: m.realtime, scheduleDate: meta.builtAt, validTo: meta.validTo, fetchedAt: Date.now() };
  }

  const UCA_T2C_OPEN = { departures, decodeFeed, merge, runsOn, serviceOrigin, dateKey, reset: () => { metaCache = null; feedCache = null; stopCache.clear(); } };
  if (typeof module !== "undefined" && module.exports) module.exports = UCA_T2C_OPEN;
  root.UCA_T2C_OPEN = UCA_T2C_OPEN;
})(typeof window !== "undefined" ? window : globalThis);
