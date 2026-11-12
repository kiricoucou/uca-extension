/* Coque de l'app web (PWA, Android et iOS) : mêmes onglets et mêmes écrans que l'app Android
   (Accueil, Études, Agenda, Lieux, Compte + Notifications, Préférences, Scolarité, Stage et emploi, Bibliothèques, Transports).
   Tout reste sur l'appareil (chrome.storage simulé par core/env.js). Un navigateur ne peut pas se connecter lui-même au CAS
   ni lire Odin (sécurité des navigateurs) : les données arrivent par « Importer mes données » depuis l'extension ou l'app Android. */
(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = chrome.storage.local;
const ICON = {
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 0-3 3-3 6s1 4 3 4v8"/></svg>',
  bus: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/></svg>',
  work: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/></svg>',
  school: '<svg viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5zM6 11v5c3 3 9 3 12 0v-5"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><path d="M4 20h16M7 16V10M12 16V6M17 16v-4"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18v.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};
const ODIN = "https://odin.iut.uca.fr/etudiants/";
const MAIL = "https://mail.uca.fr/zimbra/";
const ENT = "https://ent.uca.fr/";

/* Mêmes lieux que l'app Android (LieuxFragment.kt), positions relevées dans OpenStreetMap ; aucun horaire ni affluence inventés. */
const LIEUX = [
  ["BU Sciences des Cézeaux", false, 45.7602, 3.1140, "Campus des Cézeaux · Aubière"],
  ["Restaurant universitaire des Cézeaux", true, 45.7584, 3.1138, "Campus des Cézeaux · Aubière"],
  ["ISIMA", false, 45.7592, 3.1110, "École d'ingénieurs · Cézeaux"],
  ["SIGMA Clermont", false, 45.7578, 3.1129, "École d'ingénieurs · Cézeaux"],
  ["IUT Clermont Auvergne (Aubière)", false, 45.7628, 3.1081, "Site de Rochefeuille · Aubière"],
  ["École de Droit", false, 45.7706, 3.0896, "Cours Raymond Poincaré · Clermont-Ferrand"],
  ["BU Lafayette (Lettres & SHS)", false, 45.7739, 3.0880, "Clermont-Ferrand"],
  ["Faculté de Médecine et de Pharmacie", false, 45.7589, 3.0893, "Clermont-Ferrand"],
  ["Chirurgie dentaire (Odontologie)", false, 45.7865, 3.1120, "Rue de Braga · Saint-Jacques"],
  ["INSPÉ Chamalières", false, 45.7739, 3.0725, "Avenue Pasteur · Chamalières"],
];

let data = {};
let tab = "home";
const stack = [];   // sous-écrans ouverts au-dessus de l'onglet (bouton retour)

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
function row(icon, title, sub, attrs) {
  const a = attrs || {};
  const tag = a.href ? "a" : "button";
  const extra = a.href ? ` href="${esc(a.href)}"${/^https?:/.test(a.href) ? ' target="_blank" rel="noopener"' : ""}` : ` type="button" data-go="${esc(a.go || "")}"`;
  return `<${tag} class="row"${extra}><span class="ic">${ICON[icon] || ""}</span><span class="tx"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span><span class="chev">${ICON.chev}</span></${tag}>`;
}
const fmtTime = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
function eventDate(ev) { return new Date(ev.year, ev.month, ev.day, ev.startH, ev.startM); }
function upcoming(n) {
  const now = Date.now();
  return (data.uca_events || []).filter((e) => !e.cancelled && eventDate(e).getTime() + ((e.endH - e.startH) * 60 + e.endM - e.startM) * 60000 > now)
    .sort((a, b) => eventDate(a) - eventDate(b)).slice(0, n);
}
function whenLabel(ev) {
  const d = eventDate(ev), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(ev.year, ev.month, ev.day) - today) / 86400000);
  const day = diff === 0 ? "Aujourd'hui" : diff === 1 ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return `${day.charAt(0).toUpperCase() + day.slice(1)} · ${fmtTime(ev.startH, ev.startM)} – ${fmtTime(ev.endH, ev.endM)}`;
}

/* ------------------------------ notifications (comme NotifStore de l'app : seulement de vrais évènements) ------------------------------ */
const NK = { dismissed: "uca_notif_dismissed", saved: "uca_notif_saved" };
let notifFilter = "all";
function lsJson(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function readSet() { try { return new Set(JSON.parse(localStorage.getItem("uca_notif_read") || "[]")); } catch (e) { return new Set(); } }
function notifications() {
  const out = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const keepDays = data.settings && data.settings.activityKeepDays !== undefined ? Number(data.settings.activityKeepDays) : 30;
  const keepMs = keepDays > 0 ? keepDays * 86400000 : Infinity;   // durée réglée dans Préférences ; les « gardées » ne sont pas concernées
  (data.uca_edt_changes || []).forEach((c) => {
    if (!c.ev || (c.ev.date && c.ev.date < todayKey)) return;
    const label = { added: "Cours ajouté", cancelled: "Cours annulé", moved: "Cours déplacé", room: "Salle changée", changed: "Cours modifié" }[c.type] || "Emploi du temps modifié";
    out.push({ id: "edt:" + c.type + ":" + c.key, type: "edt", title: `${label} : ${c.ev.title || ""}`, text: (c.details || []).join(" · "), at: data.uca_last_sync || 0 });
  });
  // Notes apparues depuis moins de 7 jours (uca_notes_seen : { clé: { at, note } }, tenu à jour par la synchro).
  Object.entries(data.uca_notes_seen || {}).forEach(([k, v]) => {
    if (!v || !v.at || Date.now() - v.at > keepMs) return;
    const label = String(k).split(/[|:]/).map((x) => x.trim()).filter(Boolean).slice(-2).join(" · ");
    out.push({ id: "note:" + k + ":" + v.note, type: "note", title: "Nouvelle note" + (label ? " : " + label : ""), text: v.note != null ? String(v.note) : "", at: v.at });
  });
  // Gestion par l'utilisateur : « supprimées » (masquées), « gardées » (copie conservée même quand la source disparaît à la synchro).
  const dismissed = new Set(lsJson(NK.dismissed, [])), saved = lsJson(NK.saved, []), savedIds = new Set(saved.map((n) => n.id));
  const list = out.filter((n) => !dismissed.has(n.id));
  saved.forEach((n) => { if (!list.some((x) => x.id === n.id)) list.push(n); });
  const read = readSet();
  list.forEach((n) => { n.read = read.has(n.id); n.kept = savedIds.has(n.id); });
  return list.sort((a, b) => b.at - a.at);
}
function refreshBell() { $("bellDot").hidden = !notifications().some((n) => !n.read); }

/* ------------------------------ écrans ------------------------------ */
const SCREENS = {
  home: { title: "Accueil", render() {
    const unread = notifications().filter((n) => !n.read).length;
    return `
      <button class="banner" type="button" data-go="notifications">${ICON.bell}<span><b>Notifications UCA</b>${unread ? `${unread} nouvelle${unread > 1 ? "s" : ""} notification${unread > 1 ? "s" : ""}` : "Aucune nouvelle notification"}</span></button>
      <div class="grid2"><div>
      <div class="section-title">Statut des services UCA</div>
      <div class="card" id="statusCard">${UCA_STATUS.SITES.filter((s) => ["odin", "cas", "moodle", "mail", "site"].includes(s.id)).map((s) =>
        `<div class="status" data-site="${s.id}"><span>${esc(s.label)}</span><span class="st wait">● Vérification…</span></div>`).join("")}
        <p class="small muted" style="margin:8px 0 0">Vert = répond · Orange = lent · Rouge = injoignable. Vérifié depuis ton appareil, à l'instant.</p></div>
      </div><div>
      <div class="section-title">Raccourcis</div>
      <div class="rows">
        ${row("mail", "Messagerie Zimbra UCA", "Ouvre ta boîte de réception", { href: MAIL })}
        ${row("book", "Bibliothèques universitaires", "Compte lecteur, catalogue, horaires", { go: "livres" })}
        ${row("food", "Restaurants U et lieux", "Carte des campus et itinéraires", { go: "tab:lieux" })}
        ${row("bus", "Transports & mobilité", "T2C tram et bus, TER, covoiturage", { go: "transport" })}
      </div></div></div>`;
  }, after() { checkStatus(); } },

  etudes: { title: "Études", render() {
    const next = upcoming(3);
    return `
      <div class="grid2"><div>
      <div class="section-title">Prochains cours</div>
      ${next.length ? next.map((e) => `<div class="card next-card"><b>${esc(e.title)}</b><div class="small muted">${esc(whenLabel(e))}${e.room ? " · salle " + esc(e.room) : ""}${e.teacher ? " · " + esc(e.teacher) : ""}</div></div>`).join("")
        : `<div class="card muted">Aucun cours à venir. ${data.uca_events ? "" : 'Importe tes données pour voir ton emploi du temps.'}</div>`}
      </div><div>
      <div class="section-title">Raccourcis</div>
      <div class="rows">
        ${row("work", "Stage et emploi", "Offres de stage, alternance, premier emploi", { go: "stage" })}
        ${row("school", "Scolarité", "Certificat, relevés, inscriptions, contacts", { go: "scolarite" })}
        ${row("bell", "Notifications", "Changements d'emploi du temps, nouvelles notes", { go: "notifications" })}
      </div></div></div>`;
  } },

  lieux: { title: "Lieux universitaires", render() {
    const ok = localStorage.getItem("uca_maps_consent") === "1";
    return `<div class="grid2"><div>
      ${ok ? `<iframe class="lieu-map" src="../lieux-map.html" title="Carte des campus" loading="lazy"></iframe>`
        : `<div class="card"><b>🗺️ Carte OpenStreetMap</b><p class="small muted">Pour afficher la carte des campus (Cézeaux, Dunant, Carnot, Gergovia), ton appareil télécharge les images de la carte depuis OpenStreetMap, qui voit alors ton adresse IP. Le fond « Google Maps », si tu le choisis, peut déposer des cookies Google. Aucune donnée de cours ne quitte l'appareil.</p>
          <button class="btn" type="button" data-act="mapsOk">Afficher la carte</button><button class="btn secondary" type="button" data-act="mapsNo">Refuser (mode liste)</button></div>`}
      </div><div>
      <div class="section-title">Lieux universitaires UCA & restos CROUS</div>
      <div class="rows">${LIEUX.map((l, i) => `<button class="row" type="button" data-lieu="${i}"><span class="ic">${l[1] ? ICON.food : ICON.pin}</span><span class="tx"><b>${esc(l[0])}</b><span>${esc(l[4])}</span></span><span class="chev">${ICON.chev}</span></button>`).join("")}</div></div></div>`;
  } },

  compte: { title: "Mon compte", render() {
    const p = data.uca_profile || {};
    const groups = data.uca_my_groups || [];
    const photo = localStorage.getItem("uca_profile_photo");
    const palette = ["#2FD6CD", "#A78BFA", "#FF7EB6", "#FFB454", "#60A5FA", "#6EE7A0", "#FFD84D"];
    const details = [["Nom", p.lastName], ["Prénom", p.firstName], ["N° étudiant", p.id], ["Formation", p.formation], ["Groupe", groups.join(" · ")], ["Email", p.email]];
    const siteMenu = window.UCA_NAV ? window.UCA_NAV.menuHtml() : "";
    const homeUrl = window.UCA_NAV ? window.UCA_NAV.homeUrl : "../";
    return `<div class="home-card card" style="margin-bottom:14px">
        <a class="btn" href="${esc(homeUrl)}" data-act="siteHome">← Retour au site d'accueil</a>
        <details class="site-menu"><summary>Menu du site</summary>${siteMenu}</details>
        <button class="btn secondary" type="button" data-act="openNav">Ouvrir le menu complet (thème clair / sombre)</button>
      </div>
      <div class="grid2"><div>
      <div class="profile-head">
        <button class="avatar" type="button" data-act="photo" aria-label="Photo de profil : touche pour la changer">${photo ? `<img src="${esc(photo)}" alt="">` : ICON.person}</button>
        <div><div class="kicker">PROFIL ÉTUDIANT</div><div class="name">${esc(p.name || "Profil non détecté")}</div><div class="small">${esc(p.formation || "Université Clermont Auvergne")}</div></div>
      </div>
      <input type="file" id="photoInput" accept="image/*" hidden>
      <div class="card" style="margin-top:10px">${details.map(([l, v], i) => `<div class="detail"><i style="background:${palette[i % palette.length]}"></i><div><small style="color:${palette[i % palette.length]}">${esc(l)}</small>${v ? `<b>${esc(v)}</b>` : '<span class="muted">non détecté</span>'}</div></div>`).join("")}</div>
      <a class="btn secondary" style="margin-top:10px" href="${ODIN}" target="_blank" rel="noopener">Voir mon profil étudiant (Odin)</a>
      </div><div>
      <div class="card private" style="margin:0 0 14px">
        <b>🔒 Session privée</b>
        <p class="small muted" style="margin:6px 0 10px">Tes données restent <b>uniquement dans ce navigateur</b> (stockage local de cet appareil, aucun serveur, aucune donnée envoyée). Le site ne lit pas Odin à ta place : ouvre ce même lien sur un autre ordinateur et l'app y sera vide, jusqu'à ce que tu y importes tes données. ${data.uca_app_imported_at ? "Dernière importation ici : " + esc(new Date(data.uca_app_imported_at).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) + "." : ""}</p>
        <button class="btn" type="button" data-act="sendFrames">Envoyer vers un autre appareil (QR animé)</button>
        <p class="small muted" style="margin:8px 0 0">Même système de trames que l'application Android : l'autre appareil scanne le code qui tourne, via « Importer ».</p>
      </div>
      <div class="section-title">Mes groupes (repérés dans ton emploi du temps)</div>
      <div class="pills">${groups.map((g, i) => `<span class="pill" style="color:${palette[(i * 2 + 1) % 7]};background:${palette[(i * 2 + 1) % 7]}33">${esc(g)}</span>`).join("")}</div>
      <p class="small muted">${groups.length ? "Repérés d'après les intitulés de tes cours sur Odin." : "Aucun groupe repéré : importe ton emploi du temps, ils apparaissent d'après les intitulés (TD, TP)."}</p>
      <div class="section-title">Préférences & réglages</div>
      <button class="btn secondary" type="button" data-go="preferences">Ouvrir les préférences</button>
      <div class="section-title">Messagerie Zimbra</div>
      <a class="btn secondary" href="${MAIL}" target="_blank" rel="noopener">Accéder à ma messagerie UCA</a>
      <div class="section-title">Données & déconnexion</div>
      <a class="btn" href="import.html">Importer / resynchroniser mes données</a>
      <button class="btn danger" type="button" data-act="logout">Effacer mes données de cet appareil</button>
      <div class="section-title">Aide & conditions</div>
      <p class="small muted"><a href="../aide.html">Centre d'aide</a> · <a href="../confidentialite.html">Confidentialité</a> · <a href="../nouveautes.html">Nouveautés</a> · Version <span id="ver">—</span></p></div></div>`;
  }, after() { fetch("../version.json", { cache: "no-store" }).then((r) => r.json()).then((v) => { const e = $("ver"); if (e) e.textContent = v.version; }).catch(() => {}); } },

  notifications: { title: "Notifications", sub: true, render() {
    const all = notifications();
    if (!all.length) return `<div class="empty"><div class="big">🔔</div><b>Aucune notification</b><p class="small">${data.uca_events ? "Un changement d'emploi du temps ou une nouvelle note apparaîtra ici." : "Importe tes données pour recevoir tes alertes de notes et de cours."}</p>${lsJson(NK.dismissed, []).length ? '<button class="btn secondary" type="button" data-act="nRestore">Restaurer les notifications supprimées</button>' : ""}</div>`;
    const filters = [["all", "Toutes"], ["unread", "Non lues"], ["kept", "Gardées"], ["note", "Notes"], ["edt", "Emploi du temps"]];
    const match = (n) => notifFilter === "unread" ? !n.read : notifFilter === "kept" ? n.kept : notifFilter === "note" ? n.type === "note" : notifFilter === "edt" ? n.type === "edt" : true;
    const list = all.filter(match);
    const kept = all.filter((n) => n.kept).length, unread = all.filter((n) => !n.read).length;
    const chips = filters.map(([v, l]) => `<button type="button" class="nchip${notifFilter === v ? " on" : ""}" data-act="nFilter" data-v="${v}" aria-pressed="${notifFilter === v}">${l}${v === "unread" && unread ? ` (${unread})` : v === "kept" && kept ? ` (${kept})` : ""}</button>`).join("");
    const tools = `<div class="ntools"><button class="btn secondary" type="button" data-act="readAll">Tout marquer comme lu</button><button class="btn danger" type="button" data-act="nClear">Supprimer tout sauf les gardées</button>${lsJson(NK.dismissed, []).length ? '<button class="btn secondary" type="button" data-act="nRestore">Restaurer les supprimées</button>' : ""}</div>`;
    const cards = list.map((n) => `<div class="notif${n.read ? " read" : ""}${n.kept ? " kept" : ""}" data-notif="${esc(n.id)}" data-ntype="${n.type}" role="button" tabindex="0"><b>${n.kept ? "★ " : ""}${n.type === "note" ? "🎓" : "📍"} ${esc(n.title)}</b><span class="small muted">${esc(n.text)}${n.at ? " · " + new Date(n.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <span class="nact"><button type="button" class="nbtn" data-act="nRead" data-id="${esc(n.id)}" aria-label="${n.read ? "Marquer comme non lue" : "Marquer comme lue"}">${n.read ? "Non lue" : "Lue"}</button><button type="button" class="nbtn" data-act="nKeep" data-id="${esc(n.id)}" aria-pressed="${n.kept}" aria-label="${n.kept ? "Ne plus garder" : "Garder cette notification"}">${n.kept ? "★ Gardée" : "☆ Garder"}</button><button type="button" class="nbtn del" data-act="nDel" data-id="${esc(n.id)}" aria-label="Supprimer cette notification">Supprimer</button></span></div>`).join("");
    return `<div class="nchips" role="group" aria-label="Filtrer">${chips}</div>${tools}` + (cards || `<div class="empty"><b>Rien dans cette catégorie</b></div>`);
  } },

  preferences: { title: "Préférences", sub: true, render() {
    const s = data.settings;
    const sw = (key, label, hint, dis) => `<div class="switch-row"><label for="sw-${key}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</label><input class="switch" type="checkbox" id="sw-${key}" data-set="${key}"${s[key] ? " checked" : ""}${dis ? " disabled" : ""}></div>`;
    const notifState = !("Notification" in window) ? "indisponibles sur ce navigateur" : Notification.permission === "granted" ? "autorisées" : Notification.permission === "denied" ? "bloquées dans les réglages du navigateur" : "pas encore autorisées";
    return `
      <div class="section-title">Synchronisation</div>
      <div class="card"><p class="small muted" style="margin-top:0">Un navigateur ne peut pas se connecter lui-même à Odin : tes données arrivent depuis l'extension ou l'app Android, par lien ou QR code.</p><a class="btn" href="import.html">Importer mes données</a></div>
      <div class="section-title">Notifications</div>
      <div class="card">
        <p class="small muted" style="margin-top:0">Notifications ${esc(notifState)}.${/iPhone|iPad/.test(navigator.userAgent) ? " Sur iPhone : app ajoutée à l'écran d'accueil, iOS 16.4 ou plus." : ""}</p>
        ${"Notification" in window && Notification.permission === "default" ? '<button class="btn secondary" type="button" data-act="askNotif">Autoriser les notifications</button>' : ""}
        ${sw("remindersEnabled", "Prochains cours", `Rappel ${s.reminderMinutes} min avant (app ouverte ou en arrière-plan récent)`)}
        ${sw("notifyEdtChanges", "Changements d'emploi du temps", "Cours ajouté, annulé, déplacé, salle changée")}
        ${sw("notifyNewGrades", "Nouvelle note")}
        <div class="switch-row"><label for="sel-keep">Conserver les notifications<small>Les notifications « gardées » ne sont jamais supprimées ; les autres disparaissent après ce délai.</small></label>
          <select id="sel-keep" data-set="activityKeepDays" aria-label="Durée de conservation des notifications">${[[7, "7 jours"], [14, "14 jours"], [30, "30 jours"], [90, "90 jours"], [0, "Illimité"]].map(([v, l]) => `<option value="${v}"${Number(s.activityKeepDays === undefined ? 30 : s.activityKeepDays) === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
        ${sw("taskReminders", "Devoirs et examens", "La veille à 18 h")}
      </div>
      <div class="section-title">Design de l'agenda</div>
      <a class="btn secondary" href="../choose.html?tab=1">Changer de design</a>
      <a class="btn secondary" href="../settings.html">Tous les réglages de l'agenda</a>
      <div class="section-title">Mises à jour</div>
      <div class="card"><p class="small muted" style="margin-top:0">L'app web se met à jour toute seule dès qu'elle est en ligne (dernière version publiée sur GitHub).</p><button class="btn secondary" type="button" data-act="update">Vérifier maintenant</button></div>
      <div class="section-title">À propos</div>
      <p class="small muted">Application non officielle, non affiliée à l'Université Clermont Auvergne. Tes données (emploi du temps, notes, absences, préférences) restent uniquement sur cet appareil : aucun serveur, aucune collecte.</p>`;
  } },

  scolarite: { title: "Scolarité", sub: true, render() {
    return `
      <div class="section-title">Documents administratifs</div>
      <div class="card"><b>Certificat de scolarité</b><p class="small muted">Se télécharge sur l'ENT (rubrique Scolarité), avec ta connexion UCA. Valable pour la mutuelle, la T2C et le CROUS.</p><a class="btn" href="${ENT}" target="_blank" rel="noopener">${ICON.dl} Ouvrir l'ENT</a></div>
      <div class="section-title">Notes & relevés</div>
      <div class="rows">${row("notes", "Mes notes (dans l'app)", "Relevé importé depuis Odin", { go: "agenda:notes" })}${row("link", "Odin : relevé officiel", "odin.iut.uca.fr", { href: ODIN + "?p=notes" })}</div>
      <div class="section-title">Contacts</div>
      <div class="card small"><b>Secrétariat pédagogique de ton département</b><p class="muted" style="margin-bottom:0">Coordonnées et horaires sur l'ENT et sur le site de l'IUT (iut.uca.fr). L'app n'affiche pas de numéro qu'elle ne peut pas vérifier.</p></div>`;
  } },

  stage: { title: "Stage & Emploi", sub: true, render() {
    return `
      <div class="section-title">Démarches de stage</div>
      <div class="card small"><p style="margin-top:0">Les périodes de stage dépendent de ta formation : regarde l'emploi du temps et les annonces de ton département.</p><p class="muted" style="margin-bottom:0">Les conventions se font sur le portail PStage, depuis l'ENT.</p></div>
      <a class="btn" style="margin-top:10px" href="${ENT}" target="_blank" rel="noopener">Ouvrir l'ENT (PStage)</a>
      <div class="section-title">Offres</div>
      <div class="rows">
        ${row("work", "Offres de l'université", "Stages, alternance, emploi (site UCA)", { href: "https://www.uca.fr/formation/orientation-et-insertion-professionnelle" })}
        ${row("link", "1jeune1solution (État)", "Stages, alternance, premier emploi", { href: "https://www.1jeune1solution.gouv.fr/" })}
      </div>
      <p class="small muted">L'app n'invente pas d'offres : elle renvoie aux sources officielles.</p>`;
  } },

  livres: { title: "Bibliothèques", sub: true, render() {
    return `
      <div class="section-title">Emprunts</div>
      <div class="card small"><p style="margin-top:0">Tes emprunts et prolongations sont dans ton compte lecteur, sur le site des bibliothèques (connexion UCA).</p><a class="btn" href="https://bu.uca.fr/" target="_blank" rel="noopener">Ouvrir le site des BU</a></div>
      <div class="section-title">Bibliothèques proches</div>
      <div class="rows">${LIEUX.map((l, i) => /^BU /.test(l[0]) ? `<button class="row" type="button" data-lieu="${i}"><span class="ic">${ICON.book}</span><span class="tx"><b>${esc(l[0])}</b><span>${esc(l[4])}</span></span><span class="chev">${ICON.chev}</span></button>` : "").join("")}</div>`;
  } },

  transport: { title: "Transports", sub: true, render() { return '<iframe class="lieu-map" style="height:calc(100dvh - 160px)" src="../transport.html" title="Transports"></iframe>'; } },
};

/* ------------------------------ navigation ------------------------------ */
function current() { return stack.length ? stack[stack.length - 1] : tab; }
function show() {
  const id = current();
  const app = $("app");
  document.querySelectorAll("#bottomNav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("bottomNav").hidden = stack.length > 0 && !matchMedia("(min-width: 900px)").matches;   // ordinateur : barre latérale toujours là
  if (id === "agenda") {
    app.classList.add("agenda");
    const f = $("agendaFrame"); f.hidden = false;
    if (!f.src || show.agendaParams) { f.src = agendaUrl(show.agendaParams); show.agendaParams = ""; }
    return;
  }
  app.classList.remove("agenda"); $("agendaFrame").hidden = true;
  const s = SCREENS[id];
  $("topbarTitle").textContent = s.title;
  $("backBtn").hidden = !stack.length;
  $("screen").innerHTML = `<div class="wrap">${s.render()}</div>`;
  $("screen").scrollTop = 0;
  if (s.after) s.after();
  refreshBell();
}
let designFolder = "designs/anime";
function agendaUrl(params) { return chrome.runtime.getURL(`${designFolder}/agenda.html`) + (params || ""); }
function goTab(t) { stack.length = 0; tab = t; history.replaceState({ t }, "", "#" + t); show(); }
function open(id) { stack.push(id); history.pushState({ s: id }, "", "#" + id); show(); }
function back() { if (stack.length) history.back(); }
window.addEventListener("popstate", () => { if (stack.length) { stack.pop(); show(); } });

function go(target) {
  if (!target) return;
  if (target.startsWith("tab:")) return goTab(target.slice(4));
  if (target.startsWith("agenda:")) { show.agendaParams = "?open=" + target.slice(7); return goTab("agenda"); }
  open(target);
}

function openLieu(l) {
  const [nom, , lat, lon] = l;
  $("sheet").innerHTML = `<h2>${esc(nom)}</h2><div class="rows">
    ${row("pin", "Google Maps", "Itinéraire à pied", { href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking` })}
    ${row("pin", "Waze", "", { href: `https://waze.com/ul?ll=${lat},${lon}&navigate=yes` })}
    ${row("pin", "OpenStreetMap", "", { href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` })}
    ${/iPhone|iPad|Mac/.test(navigator.userAgent) ? row("pin", "Plans (Apple)", "", { href: `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=w` }) : ""}
  </div><button class="btn secondary" type="button" data-act="closeSheet" style="margin-top:12px">Annuler</button>`;
  $("sheet").hidden = false; $("sheetBackdrop").hidden = false;
}

/* ============ Mises à jour depuis GitHub (version.json) ============
   L'app web est toujours servie « réseau d'abord » (sw.js) : une ouverture en ligne charge déjà la dernière version.
   Ici : (1) au premier lancement après une mise à jour, la liste de TOUT ce qui a changé depuis la version précédente
   (défilante) ; (2) application ouverte longtemps : une fenêtre « Nouvelle version disponible » avec les nouveautés et un
   bouton qui vide le cache et recharge. L'historique vient de version.json (champ history, généré à chaque publication). */
const semver = (a) => String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
function newer(a, b) { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
const buildId = (v) => `${v.ota_version || v.version}|${v.published_at || ""}`;
async function fetchVersion() {
  try { const r = await fetch("../version.json?t=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
/* Versions publiées depuis `since` (la plus récente d'abord) ; sans historique, le changelog de la dernière. */
function newsSince(v, since) {
  const out = [];
  (Array.isArray(v.history) ? v.history : []).forEach((h) => {
    if (h && h.app && (!since || newer(h.app, since))) out.push({ version: String(h.app), title: String(h.title || ""), items: (Array.isArray(h.items) ? h.items : []).map(String) });
  });
  if (!out.length && Array.isArray(v.changelog)) out.push({ version: String(v.version || ""), title: "", items: v.changelog.map(String) });
  return out;
}
function newsHtml(list) {
  return `<div class="news" tabindex="0" aria-label="Nouveautés">${list.map((n) => `<h3>v${esc(n.version)}${n.title ? ` · ${esc(n.title)}` : ""}</h3><ul>${n.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("") || '<p class="muted small">Aucun détail publié.</p>'}</div>`;
}
async function applyUpdate() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== "uca-share").map((k) => caches.delete(k)));
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update().catch(() => {});
  } catch (e) { /* rechargement quand même : réseau d'abord */ }
  location.reload();
}
const UPD = { boot: null, shownFor: null };
function showUpdateSheet(v, kind, since) {
  const title = kind === "available" ? `Nouvelle version disponible (v${esc(v.version)})` : `Mise à jour installée (v${esc(v.version)})`;
  $("sheet").innerHTML = `<h2>${title}</h2><p class="small muted" style="margin:0 0 8px">${kind === "available" ? "Voici ce qui change :" : "Voici ce qui a changé depuis ta dernière visite :"}</p>${newsHtml(newsSince(v, since))}`
    + (kind === "available" ? `<button class="btn" type="button" data-act="applyUpdate" style="margin-top:12px">Mettre à jour maintenant</button><button class="btn secondary" type="button" data-act="closeSheet" style="margin-top:10px">Plus tard</button>`
      : `<button class="btn" type="button" data-act="closeSheet" style="margin-top:12px">OK</button>`);
  $("sheet").hidden = false; $("sheetBackdrop").hidden = false;
}
async function checkUpdates(manual) {
  if (navigator.onLine === false) { if (manual) toast("Impossible de vérifier : pas de connexion"); return; }
  const v = await fetchVersion();
  if (!v) { if (manual) toast("Impossible de vérifier : pas de connexion"); return; }
  if (UPD.boot === null) {
    UPD.boot = buildId(v);
    const seen = localStorage.getItem("uca_pwa_seen_app");
    localStorage.setItem("uca_pwa_seen_app", String(v.version));
    if (seen && newer(v.version, seen)) showUpdateSheet(v, "done", seen);   // venue d'être mise à jour : on montre les nouveautés
    else if (manual) toast("L'app est à jour (v" + v.version + ")");
    return;
  }
  if (buildId(v) !== UPD.boot) {
    if (manual || UPD.shownFor !== buildId(v)) { UPD.shownFor = buildId(v); showUpdateSheet(v, "available", localStorage.getItem("uca_pwa_seen_app")); }
  } else if (manual) toast("L'app est à jour (v" + v.version + ")");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && UPD.boot !== null) checkUpdates(false); });
setInterval(() => { if (!document.hidden) checkUpdates(false); }, 15 * 60 * 1000);

let frameTimer = 0;
function closeSheet() { clearInterval(frameTimer); $("sheet").hidden = true; $("sheetBackdrop").hidden = true; }
/* Trames : instantané des données en QR animé (core/transfer.js, comme l'APK et l'extension) ; l'autre appareil le lit via « Importer ». */
async function sendFrames() {
  const T = window.UCA_TRANSFER;
  if (!T) { toast("Transfert indisponible"); return; }
  const frames = await T.encodeFrames(await T.snapshot());
  $("sheet").innerHTML = `<h2>Envoyer vers un autre appareil</h2><p class="small muted" style="margin:0 0 10px">Sur l'autre appareil : ouvre l'app, « Importer », puis « Scanner » et vise ce code qui tourne en boucle. Rien ne passe par un serveur.</p><div style="text-align:center"><canvas id="frameQr" aria-label="Code QR animé"></canvas><div class="small muted" id="frameCount" style="margin-top:6px"></div></div><button class="btn secondary" type="button" data-act="closeSheet" style="margin-top:12px">Fermer</button>`;
  $("sheet").hidden = false; $("sheetBackdrop").hidden = false;
  let i = 0;
  const show1 = () => { T.drawQr($("frameQr"), frames[i], 280); $("frameCount").textContent = `Trame ${i + 1} / ${frames.length}`; i = (i + 1) % frames.length; };
  show1(); clearInterval(frameTimer); frameTimer = setInterval(show1, 280);
}

async function checkStatus() {
  const ids = ["odin", "cas", "moodle", "mail", "site"];
  const LABEL = { ok: "● Répond", slow: "● Lent", down: "● Injoignable" };
  await Promise.all(UCA_STATUS.SITES.filter((s) => ids.includes(s.id)).map(async (site) => {
    const r = await UCA_STATUS.check(site);
    const el = document.querySelector(`#statusCard [data-site="${site.id}"] .st`);
    if (el) { el.className = "st " + r.state; el.textContent = LABEL[r.state]; el.title = r.reason || (r.ms + " ms"); }
  }));
}

async function onAction(act, el) {
  if (act === "mapsOk") { localStorage.setItem("uca_maps_consent", "1"); show(); }
  else if (act === "mapsNo") { localStorage.setItem("uca_maps_consent", "0"); el.closest(".card").remove(); }
  else if (act === "closeSheet") closeSheet();
  else if (act === "photo") $("photoInput").click();
  else if (act === "readAll") { localStorage.setItem("uca_notif_read", JSON.stringify(notifications().map((n) => n.id))); toast("Toutes les notifications sont marquées comme lues"); show(); }
  else if (act === "askNotif") { await Notification.requestPermission(); show(); }
  else if (act === "sendFrames") await sendFrames();
  else if (act === "openNav") { if (window.UCA_NAV) window.UCA_NAV.open(); }
  else if (act === "nFilter") { notifFilter = el.dataset.v; show(); }
  else if (act === "nRead") { const r = readSet(), id = el.dataset.id; if (r.has(id)) r.delete(id); else r.add(id); lsSet("uca_notif_read", [...r]); refreshBell(); show(); }
  else if (act === "nKeep") {
    const id = el.dataset.id, saved = lsJson(NK.saved, []), n = notifications().find((x) => x.id === id);
    if (saved.some((x) => x.id === id)) lsSet(NK.saved, saved.filter((x) => x.id !== id));
    else if (n) lsSet(NK.saved, saved.concat([{ id: n.id, type: n.type, title: n.title, text: n.text, at: n.at }]));
    show();
  }
  else if (act === "nDel") {
    const id = el.dataset.id, d = new Set(lsJson(NK.dismissed, [])); d.add(id); lsSet(NK.dismissed, [...d]);
    lsSet(NK.saved, lsJson(NK.saved, []).filter((x) => x.id !== id)); refreshBell(); toast("Notification supprimée"); show();
  }
  else if (act === "nClear") {
    const keep = new Set(lsJson(NK.saved, []).map((x) => x.id)), d = new Set(lsJson(NK.dismissed, []));
    notifications().forEach((n) => { if (!keep.has(n.id)) d.add(n.id); }); lsSet(NK.dismissed, [...d]); refreshBell(); toast("Notifications supprimées (les gardées restent)"); show();
  }
  else if (act === "nRestore") { localStorage.removeItem(NK.dismissed); refreshBell(); toast("Notifications restaurées"); show(); }
  else if (act === "update") await checkUpdates(true);
  else if (act === "applyUpdate") await applyUpdate();
  else if (act === "logout") {
    // Même effet que « Se déconnecter » de l'app Android : tout ce qui est enregistré sur l'appareil est effacé.
    if (!confirm("Effacer emploi du temps, notes, absences et réglages de cet appareil ?")) return;
    await chrome.storage.local.clear();
    ["uca_profile_photo", "uca_notif_read", "uca_notif_dismissed", "uca_notif_saved", "uca_maps_consent", "uca_install_seen"].forEach((k) => localStorage.removeItem(k));
    location.replace("index.html");
  }
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("#bottomNav button"); if (nav) return goTab(nav.dataset.tab);
  const g = e.target.closest("[data-go]"); if (g && g.dataset.go) { e.preventDefault(); return go(g.dataset.go); }
  const a = e.target.closest("[data-act]"); if (a) return onAction(a.dataset.act, a);
  const l = e.target.closest("[data-lieu]"); if (l) return openLieu(LIEUX[+l.dataset.lieu]);
  const n = e.target.closest("[data-notif]");
  if (n) {
    const read = readSet(); read.add(n.dataset.notif); localStorage.setItem("uca_notif_read", JSON.stringify([...read]));
    return go(n.dataset.ntype === "note" ? "agenda:notes" : "tab:agenda");
  }
});
document.addEventListener("change", async (e) => {
  const k = e.target.dataset && e.target.dataset.set;
  if (k) { const val = e.target.type === "checkbox" ? e.target.checked : Number(e.target.value); await UCA_saveSettings({ [k]: val }); data.settings[k] = val; toast("Enregistré"); }
  if (e.target.id === "photoInput" && e.target.files[0]) {
    // Photo réduite à 256 px et gardée sur l'appareil uniquement (comme ProfilePhoto.kt).
    try {
      const bmp = await createImageBitmap(e.target.files[0]);
      const c = document.createElement("canvas"); const side = Math.min(bmp.width, bmp.height); c.width = c.height = 256;
      c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
      localStorage.setItem("uca_profile_photo", c.toDataURL("image/jpeg", 0.85)); show();
    } catch (err) { toast("Image illisible, choisis une autre photo."); }
  }
});
$("backBtn").addEventListener("click", back);
$("bellBtn").addEventListener("click", () => open("notifications"));
$("menuBtn").addEventListener("click", () => { if (window.UCA_NAV) window.UCA_NAV.open(); });
$("personBtn").addEventListener("click", () => goTab("compte"));
$("sheetBackdrop").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (!$("sheet").hidden) closeSheet(); else back(); }
  if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("notif")) { e.preventDefault(); e.target.click(); }
});

async function load() {
  const keys = ["uca_events", "uca_edt_changes", "uca_notes_seen", "uca_my_groups", "uca_profile", "uca_last_sync", "uca_app_imported_at", "uca_session_expired", "uca_design"];
  data = await store.get(keys);
  data.settings = await UCA_getSettings();
  const stale = data.uca_last_sync && Date.now() - data.uca_last_sync > 3 * 86400000;
  $("sessionBanner").hidden = !(data.uca_session_expired || stale);
}

/* Le menu et la coque prennent l'aspect du design choisi (voir html[data-design] dans shell.css). */
function applyDesign(id) { document.documentElement.dataset.design = id; }

(async function init() {
  const designs = await fetch(chrome.runtime.getURL("designs/designs.json")).then((r) => r.json()).catch(() => []);
  await load();
  // Premier lancement sans données : écran d'import, comme l'agenda (core/agenda.js) le fait déjà.
  if (!(data.uca_events || []).length && !sessionStorage.getItem("uca_import_skip")) { location.replace("import.html"); return; }
  const d = designs.find((x) => x.id === data.uca_design);
  if (d) designFolder = d.folder;
  applyDesign(d ? d.id : "anime");
  const params = new URLSearchParams(location.search);
  const want = location.hash.slice(1);
  if (params.get("view") || params.get("open")) { show.agendaParams = location.search.replace(/[?&]source=pwa/, "").replace(/^&/, "?"); tab = "agenda"; }
  else if (["home", "etudes", "agenda", "lieux", "compte"].includes(want)) tab = want;
  else tab = data.uca_events ? "agenda" : "home";   // comme l'app : ouverture sur l'agenda une fois les données là
  history.replaceState({ t: tab }, "", location.pathname + location.search + "#" + tab);
  show();
  checkUpdates(false);
  chrome.storage.onChanged && chrome.storage.onChanged.addListener(async () => { await load(); { const dd = designs.find((x) => x.id === data.uca_design); if (dd) { designFolder = dd.folder; applyDesign(dd.id); } } if (current() !== "agenda") show(); else refreshBell(); });
})();
})();
