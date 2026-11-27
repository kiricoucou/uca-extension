(function () {
  "use strict";

  const M = window.UCA_MOBILITY;
  const FAV_KEY = "uca_transport_favoris";
  const MAX_FAVORITES = 8;
  const REFRESH_MS = 60000;
  const SEARCH_PAGE = 8;
  const OFFICIAL_T2C = "https://www.t2c.fr/";
  // Raccourcis : uniquement des arrêts présents dans core/t2c_data.js (un code absent n'est pas affiché).
  const CAMPUS = ["CAMP", "CEPE", "UCAC", "FACU", "CARN"];

  const $ = (id) => document.getElementById(id);

  // Tout le contenu dynamique passe par ici : les textes sont insérés comme du texte, jamais comme du HTML.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.keys(props || {}).forEach((key) => {
      if (key === "text") node.textContent = props[key];
      else if (key === "onClick") node.addEventListener("click", props[key]);
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach((child) => { if (child) node.append(child); });
    return node;
  }

  function lineTag(name, color, textColor) {
    const tag = el("span", { class: "line-tag", text: name });
    const colors = M.safeColors(color, textColor);
    tag.style.backgroundColor = colors.color;
    tag.style.color = colors.textColor;
    return tag;
  }

  const plural = (n, word) => n + " " + word + (n > 1 ? "s" : "");
  const stopTitle = (stop) => stop.shortName || stop.name;
  const stopLines = (stop) => (Array.isArray(stop.lines) ? stop.lines : []);
  function stopDescription(stop) {
    const lines = stopLines(stop);
    const parts = [];
    if (stop.name && stop.name !== stopTitle(stop)) parts.push(stop.name);
    if (lines.length) parts.push((lines.length > 1 ? "lignes " : "ligne ") + lines.join(", "));
    return parts.join(" · ");
  }

  // --- ONGLETS ---
  const TABS = ["departs", "lignes", "ailleurs"];
  function showTab(name, focus) {
    TABS.forEach((t) => {
      const selected = t === name;
      $("tab-" + t).setAttribute("aria-selected", String(selected));
      $("tab-" + t).tabIndex = selected ? 0 : -1;
      $("pane-" + t).hidden = !selected;
    });
    if (focus) $("tab-" + name).focus();
  }
  TABS.forEach((name, index) => {
    $("tab-" + name).addEventListener("click", () => showTab(name));
    $("tab-" + name).addEventListener("keydown", (e) => {
      const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      showTab(TABS[(moves[e.key] + TABS.length) % TABS.length], true);
    });
  });

  if (!M || !M.transitStops.length) {
    $("stopName").textContent = "Liste des arrêts indisponible";
    $("stopInfo").textContent = "Le fichier des arrêts n'a pas pu être chargé. Rechargez la page ou consultez le site officiel.";
    $("departures").append(el("a", { href: OFFICIAL_T2C, target: "_blank", rel: "noopener noreferrer", text: "Site officiel T2C (t2c.fr)" }));
    return;
  }

  // --- FAVORIS ---
  function loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      const ids = saved.map((id) => M.getStopById(id)).filter(Boolean).map((s) => String(s.id));
      return Array.from(new Set(ids)).slice(0, MAX_FAVORITES);
    } catch (_) { return []; }
  }
  let favorites = loadFavorites();
  let currentStop = null;

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
      return true;
    } catch (_) { return false; }
  }

  function stopButton(stop, label) {
    const id = String(stop.id);
    return el("button", {
      type: "button", class: "btn", text: label, "data-stop": id,
      "aria-pressed": String(Boolean(currentStop) && String(currentStop.id) === id),
      onClick: () => selectStop(id)
    });
  }

  function renderShortcuts() {
    const active = document.activeElement;
    const focused = active && active.dataset.stop && active.parentElement && ["favList", "campusList"].includes(active.parentElement.id)
      ? { list: active.parentElement.id, stop: active.dataset.stop } : null;
    $("favList").replaceChildren(...favorites.map((id) => {
      const stop = M.getStopById(id);
      return stopButton(stop, "★ " + stopTitle(stop));
    }));
    $("favEmpty").hidden = favorites.length > 0;
    $("campusList").replaceChildren(...CAMPUS.map((id) => M.getStopById(id)).filter(Boolean).map((s) => stopButton(s, stopTitle(s))));
    if (focused) {
      const again = $(focused.list).querySelector('[data-stop="' + focused.stop + '"]');
      if (again) again.focus();
    }
  }

  function renderFavoriteToggle() {
    const on = Boolean(currentStop) && favorites.includes(String(currentStop.id));
    $("favToggle").setAttribute("aria-pressed", String(on));
    $("favToggle").textContent = on ? "★ Dans mes favoris (retirer)" : "☆ Ajouter aux favoris";
  }

  $("favToggle").addEventListener("click", () => {
    if (!currentStop) return;
    const id = String(currentStop.id);
    let note = "";
    if (favorites.includes(id)) favorites = favorites.filter((f) => f !== id);
    else if (favorites.length >= MAX_FAVORITES) note = "Vous avez déjà " + MAX_FAVORITES + " favoris : retirez-en un d'abord.";
    else favorites.push(id);
    if (!saveFavorites()) note = "Ce navigateur refuse l'enregistrement : les favoris seront perdus à la fermeture de la page.";
    $("favNote").textContent = note;
    renderShortcuts();
    renderFavoriteToggle();
  });

  // --- PROCHAINS PASSAGES ---
  // Chaque demande porte un numéro : une réponse qui n'est plus la dernière demandée est ignorée.
  let requestNumber = 0;
  let pending = false;
  let lastFetchedAt = 0;

  function selectStop(id) {
    const stop = M.getStopById(id);
    if (!stop) return;
    currentStop = stop;
    $("stopName").textContent = stopTitle(stop);
    $("stopInfo").textContent = stopDescription(stop);
    $("stopActions").hidden = false;
    renderShortcuts();
    renderFavoriteToggle();
    loadDepartures({ reset: true, announce: true });
  }

  async function loadDepartures(options) {
    if (!currentStop) return;
    const number = ++requestNumber;
    const id = String(currentStop.id);
    pending = true;
    if (options.announce) $("announce").textContent = "";
    if (options.reset) {
      lastFetchedAt = 0;
      $("fetchTime").textContent = "";
      $("departures").replaceChildren(el("p", { class: "state-box", text: "Chargement des passages…" }));
      $("departures").setAttribute("aria-busy", "true");
    }
    $("refreshBtn").textContent = "Actualisation…";
    const result = await M.fetchDepartures(id);
    if (number !== requestNumber) return;
    pending = false;
    lastFetchedAt = result.fetchedAt;
    $("refreshBtn").textContent = "Actualiser";
    $("departures").removeAttribute("aria-busy");
    renderResult(result);
    if (options.announce) {
      $("announce").textContent = stopTitle(currentStop) + " : " + (
        result.state === "ok" ? "passages affichés." : result.state === "empty" ? "aucun passage annoncé." : "informations indisponibles.");
    }
  }

  const hhmm = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  function departureItem(d, now) {
    const minutes = Math.floor((d.time - now) / 60000);
    const sameDay = new Date(d.time).toDateString() === new Date(now).toDateString();
    const dayLabel = sameDay ? "" : " le " + new Date(d.time).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    let eta;
    if (!sameDay || minutes >= 60) eta = hhmm(d.time);
    else if (minutes < 1) eta = "Imminent";
    else eta = "dans " + minutes + " min";

    let clock = "à " + hhmm(d.time) + dayLabel;
    if (d.realtime && d.plannedTime !== null) {
      const shift = Math.round((d.time - d.plannedTime) / 60000);
      if (shift >= 1) clock += " (" + shift + " min après l'horaire prévu)";
      else if (shift <= -1) clock += " (" + -shift + " min avant l'horaire prévu)";
    }
    return el("li", { class: "time" }, [
      el("span", { class: "eta", text: eta }),
      el("span", { class: "clock", text: clock }),
      el("span", { class: "badge " + (d.realtime ? "live" : "planned"), text: d.realtime ? "En direct" : "Prévu" })
    ]);
  }

  function officialLink() {
    return el("a", { href: OFFICIAL_T2C, target: "_blank", rel: "noopener noreferrer", text: "Vérifier sur le site officiel T2C (t2c.fr)" });
  }

  function renderResult(result) {
    const box = $("departures");
    const retryHadFocus = document.activeElement && document.activeElement.id === "retryBtn";
    const stamp = new Date(result.fetchedAt).toLocaleTimeString("fr-FR");

    if (result.state === "unavailable") {
      $("fetchTime").textContent = "Dernière tentative à " + stamp + ".";
      box.replaceChildren(el("div", { class: "state-box", "data-state": "unavailable" }, [
        el("span", { class: "badge down", text: "Indisponible" }),
        el("p", { text: "Les prochains passages n'ont pas pu être obtenus. Cela ne veut pas dire qu'aucun bus ou tram ne passe." }),
        el("p", { text: result.reason === "arret" ? "T2C ne publie pas d'horaire officiel pour cet arrêt." : result.reason === "perime" ? "Les horaires officiels disponibles sont périmés : la mise à jour n'a pas encore eu lieu." : "Vérifie ta connexion Internet, puis réessaie." }),
        el("div", { class: "btn-row" }, [
          el("button", { type: "button", class: "btn primary", id: "retryBtn", text: "Réessayer", onClick: () => { $("stopName").focus(); loadDepartures({ reset: true, announce: true }); } })
        ]),
        el("p", {}, [officialLink()])
      ]));
      if (retryHadFocus) $("retryBtn").focus();
      return;
    }

    $("fetchTime").textContent = "Actualisé à " + stamp + (result.realtime ? " · temps réel officiel T2C." : " · temps réel indisponible pour le moment : horaires prévus uniquement.");
    if (result.state === "empty") {
      box.replaceChildren(el("div", { class: "state-box", "data-state": "empty" }, [
        el("span", { class: "badge none", text: "Aucun passage annoncé" }),
        el("p", { text: "Aucun passage prévu dans les 3 prochaines heures à cet arrêt." }),
        el("p", {}, [officialLink()])
      ]));
      return;
    }

    const now = Date.now();
    box.replaceChildren(...M.groupDepartures(result.departures, 3).map((group) => {
      const mode = group.type === "tram" ? "Tram" : group.type === "bus" ? "Bus" : "Ligne";
      return el("div", { class: "group" }, [
        el("div", { class: "group-head" }, [
          lineTag(group.line, group.color, group.textColor),
          el("div", { class: "group-dest", text: mode + " " + group.line + " · direction " + group.destination })
        ]),
        el("ul", { class: "times" }, group.departures.map((d) => departureItem(d, now)))
      ]);
    }));
  }

  $("refreshBtn").addEventListener("click", () => loadDepartures({ reset: false, announce: true }));

  function refreshIfStale(maxAge) {
    if (document.visibilityState !== "visible" || $("pane-departs").hidden || pending || !currentStop) return;
    if (Date.now() - lastFetchedAt < maxAge) return;
    // Après une longue pause, les anciens horaires sont retirés pendant la nouvelle demande.
    loadDepartures({ reset: Date.now() - lastFetchedAt > 3 * REFRESH_MS, announce: false });
  }
  setInterval(() => refreshIfStale(REFRESH_MS - 1000), REFRESH_MS);
  document.addEventListener("visibilitychange", () => refreshIfStale(REFRESH_MS));

  // --- RECHERCHE ---
  let shown = SEARCH_PAGE;

  // Surligne la saisie sans tenir compte des accents (« cezeaux » trouve « Cézeaux »).
  function highlighted(label, query) {
    const q = M.normalizeText(query);
    let folded = "";
    const origin = [];
    for (let i = 0; i < label.length; i++) {
      const piece = label[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      for (let j = 0; j < piece.length; j++) { folded += piece[j]; origin.push(i); }
    }
    const at = q ? folded.indexOf(q) : -1;
    const span = el("span");
    if (at === -1) { span.textContent = label; return span; }
    const start = origin[at];
    const end = origin[at + q.length - 1] + 1;
    span.append(label.slice(0, start), el("mark", { text: label.slice(start, end) }), label.slice(end));
    return span;
  }

  function renderSearch() {
    const query = $("stopSearch").value;
    const total = M.transitStops.length;
    if (!query.trim()) {
      $("searchCount").textContent = total + " arrêts de bus et de tram dans la copie.";
      $("searchResults").replaceChildren();
      $("searchMore").hidden = true;
      return;
    }
    const found = M.searchStops(query);
    const visible = found.slice(0, shown);
    $("searchCount").textContent = found.length
      ? plural(found.length, "arrêt") + " sur " + total + (found.length > visible.length ? " (" + visible.length + " affichés)." : ".")
      : "Aucun arrêt de bus ou de tram ne correspond. Les parkings, stations de vélos et points de vente ne sont pas listés ici.";
    $("searchResults").replaceChildren(...visible.map((stop) => el("li", {}, [
      el("button", {
        type: "button", class: "btn stop-option", "data-stop": String(stop.id),
        onClick: () => {
          $("stopSearch").value = "";
          renderSearch();
          selectStop(stop.id);
          $("stopName").focus();
        }
      }, [highlighted(stopTitle(stop), query), el("span", { class: "sub", text: stopDescription(stop) })])
    ])));
    $("searchMore").hidden = found.length <= visible.length;
  }

  $("stopSearch").addEventListener("input", () => { shown = SEARCH_PAGE; renderSearch(); });
  $("searchMore").addEventListener("click", () => { shown += SEARCH_PAGE * 2; renderSearch(); });

  // --- LIGNES ---
  const routes = M.getAllRoutes();
  const MAIN = ["B", "C", "E1", "E2", "E3", "E4", "E5", "E6", "E7"];
  const CATEGORIES = [
    { label: "Toutes", test: () => true },
    { label: "Tram", test: (r) => r.type === "tram" },
    { label: "Bus B, C et E", test: (r) => MAIN.includes(r.shortName) },
    { label: "Lignes S et P", test: (r) => /^[SP]\d/.test(r.shortName) },
    { label: "Autres", test: (r) => r.type !== "tram" && !MAIN.includes(r.shortName) && !/^[SP]\d/.test(r.shortName) }
  ];
  let category = CATEGORIES[0];

  function renderRoutes() {
    $("routeFilters").replaceChildren(...CATEGORIES.map((c) => el("button", {
      type: "button", class: "btn", "aria-pressed": String(c === category),
      text: c.label + " (" + routes.filter(c.test).length + ")",
      onClick: () => {
        category = c;
        renderRoutes();
        const active = $("routeFilters").querySelector('[aria-pressed="true"]');
        if (active) active.focus();
      }
    })));
    $("routesGrid").replaceChildren(...routes.filter(category.test).map((r) => el("button", {
      type: "button", class: "btn route-btn", "data-line": r.shortName, onClick: () => showLine(r.shortName)
    }, [
      lineTag(r.shortName, r.color, r.textColor),
      el("span", { text: r.directions.slice(0, 2).join(" / ") || (r.type === "tram" ? "Tram" : "Bus") })
    ])));
  }

  function showLine(name) {
    const route = M.getRouteDetails(name);
    if (!route) return;
    $("lineTitle").textContent = (route.type === "tram" ? "Tram " : "Bus ") + route.shortName;
    $("lineInfo").textContent = (route.directions.length ? "Terminus cités : " + route.directions.join(", ") + ". " : "") +
      plural(route.stops.length, "arrêt") + " dans la copie. L'ordre et la liste peuvent différer selon le sens ou la variante du trajet.";
    $("lineStops").replaceChildren(...route.stops.map((s) => {
      const stop = M.getStopById(s.stopId || s.id);
      return el("li", {}, [stop
        ? el("button", {
            type: "button", class: "btn", "data-stop": String(stop.id), text: s.name || stopTitle(stop),
            "aria-label": "Voir les passages à l'arrêt " + (s.name || stopTitle(stop)),
            onClick: () => { showTab("departs"); selectStop(stop.id); $("stopName").focus(); }
          })
        : el("span", { text: s.name || "" })]);
    }));
    $("lineDetail").hidden = false;
    $("lineTitle").focus();
    $("lineDetail").scrollIntoView({ block: "start" });
  }

  // --- DÉMARRAGE ---
  const generated = new Date(M.generatedAt);
  $("dataDate").textContent = "Liste des arrêts et des lignes : copie des données T2C " +
    (Number.isNaN(generated.getTime()) ? "de date inconnue" : "du " + generated.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })) +
    ". Elle ne se met pas à jour toute seule : un arrêt ou une ligne a pu changer depuis. Les noms de commune peuvent être incomplets ou inexacts.";
  $("routesCount").textContent = String(routes.length);
  renderRoutes();
  renderShortcuts();
  renderSearch();
  if (favorites.length) selectStop(favorites[0]);
})();

/* Retour et menu : le site seulement (la page sert aussi dans l'extension et dans l'APK). */
(function () {
  "use strict";
  const back = document.getElementById("backLink");
  if (back && window.top !== window) back.hidden = true;
  if (location.protocol === "chrome-extension:" || location.protocol === "moz-extension:") { if (back) back.hidden = true; return; }
  if (!document.querySelector('meta[name="uca-site"]')) return;   // copie de l'APK : pas de menu du site
  const nav = document.createElement("script"); nav.src = "site-nav.js"; nav.defer = true; document.body.appendChild(nav);
})();
