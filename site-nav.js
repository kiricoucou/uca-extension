/* Menu hamburger commun (site, pages publiques et application) : une icône SVG colorée et différente par entrée,
   bascule Clair / Sombre / Auto (soleil, lune), bouton « Accueil » sur les pages sans barre d'en-tête.
   Chemins relatifs à ce script (racine du site). Styles injectés ici : fonctionne aussi dans les pages à palette propre. */
(function () {
  "use strict";
  var s = document.currentScript, root = new URL('.', s.src).href;
  var KEY = 'uca-site-theme';

  /* ---------- icônes : [couleur, forme teintée (fermée), traits] ---------- */
  var I = {
    home:    ['#0b7bc4', 'M4 11l8-7 8 7v9H4z', 'M3 12l9-8 9 8M9 20v-6h6v6'],
    agenda:  ['#16a34a', 'M4 6h16v14H4z', 'M4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2'],
    news:    ['#f59e0b', 'M12 3l2.4 5.6 6 .6-4.5 4 1.4 6-5.3-3.2L6.7 19.2l1.4-6-4.5-4 6-.6z', 'M12 3l2.4 5.6 6 .6-4.5 4 1.4 6-5.3-3.2L6.7 19.2l1.4-6-4.5-4 6-.6z'],
    help:    ['#8b5cf6', 'M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M9.6 9.5a2.5 2.5 0 114 2c-.9.6-1.6 1-1.6 2.2M12 17h.01'],
    bus:     ['#f97316', 'M5 4h14a1 1 0 011 1v11H4V5a1 1 0 011-1z', 'M4 11h16M7 20v-2M17 20v-2M7.5 15h.01M16.5 15h.01M4 16h16'],
    pin:     ['#ef4444', 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z', 'M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 9m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0'],
    puzzle:  ['#0d9488', 'M5 8h4a2 2 0 114 0h4v4a2 2 0 110 4v4H5z', 'M5 8h4a2 2 0 114 0h4v4a2 2 0 110 4v4H5z'],
    install: ['#4f46e5', 'M4 15v5h16v-5', 'M12 3v12M7 10l5 5 5-5M4 15v5h16v-5'],
    phone:   ['#22c55e', 'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1z', 'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1zM11 19h2'],
    update:  ['#06b6d4', 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3', 'M18 3v4h-4M6 21v-4h4M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3'],
    heart:   ['#ec4899', 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 9c0 6-8 11-8 11z', 'M12 20s-8-5-8-11a4.5 4.5 0 018-2.7A4.5 4.5 0 0120 9c0 6-8 11-8 11z'],
    thanks:  ['#84cc16', 'M4 9h16v4H4zM5 13h14v7H5z', 'M4 9h16v4H4zM5 13h14v7H5zM12 9v11M12 9c-2-4-5-4-5-2s3 2 5 2c2 0 5 0 5-2s-3-2-5 2'],
    shield:  ['#475569', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4'],
    globe:   ['#0ea5e9', 'M3 12a9 9 0 1018 0 9 9 0 10-18 0', 'M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'],
    play:    ['#d946ef', 'M5 4l15 8-15 8z', 'M5 4l15 8-15 8z'],
    compare: ['#14b8a6', 'M4 5h7v14H4zM13 9h7v10h-7z', 'M4 5h7v14H4zM13 9h7v10h-7z'],
    faq:     ['#a855f7', 'M4 5h16v11H9l-5 4z', 'M4 5h16v11H9l-5 4zM9.5 9.5a2.5 2.5 0 114 1.8c-.8.5-1.5.8-1.5 1.7M12 14.6h.01'],
    user:    ['#3b82f6', 'M8 8a4 4 0 108 0 4 4 0 10-8 0', 'M8 8a4 4 0 108 0 4 4 0 10-8 0M4 21a8 8 0 0116 0'],
    sun:     ['#f59e0b', 'M8 12a4 4 0 108 0 4 4 0 10-8 0', 'M8 12a4 4 0 108 0 4 4 0 10-8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5'],
    moon:    ['#6366f1', 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z', 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z'],
    auto:    ['#64748b', 'M3 5h18v11H3z', 'M3 5h18v11H3zM8 20h8M12 16v4'],
    guide:   ['#7c3aed', 'M3 6l9-3 9 3v13l-9 3-9-3z', 'M3 6l9-3 9 3v13l-9 3-9-3zM12 3v19M3 6l9 3 9-3'],
    burger:  ['currentColor', '', 'M4 6h16M4 12h16M4 18h16'],
    back:    ['#0b7bc4', '', 'M15 5l-7 7 7 7']
  };
  function svg(k) {
    var a = I[k] || I.home, tint = a[1] ? '<path d="' + a[1] + '" style="fill:' + a[0] + ';fill-opacity:.16;stroke:none"/>' : '';
    /* styles en ligne : une feuille de style de page (svg{stroke:currentColor}, ex. l'application) ne peut pas les écraser */
    return '<svg class="nv-i" viewBox="0 0 24 24" width="22" height="22" style="fill:none;stroke:' + a[0] + ';stroke-width:2;stroke-linecap:round;stroke-linejoin:round" aria-hidden="true">' + tint + '<path d="' + a[2] + '" style="fill:none;stroke:' + a[0] + '"/></svg>';
  }

  /* ---------- liste des liens (une icône différente par bouton) ---------- */
  var L = [
    ['Site', [['Accueil', '', 'home'], ['Agenda en ligne', 'app/shell.html#home', 'agenda'], ['Nouveautés', 'nouveautes.html', 'news'], ['Aide', 'aide.html', 'help'], ['Transports', 'transport.html', 'bus'], ['Carte des lieux', 'lieux-map.html', 'pin']]],
    ['Installer', [['Télécharger l’extension (ZIP)', 'extension/', 'puzzle'], ['Installateurs Windows · Mac · Linux', 'extension/#installateurs', 'install'], ['Application Android (APK)', 'telecharger/', 'phone'], ['Mettre à jour l’extension', 'extension/#maj', 'update'], ['Aide à l’installation (en images)', 'installation.html', 'guide']]],
    ['Projet', [['Soutenir le projet (don)', 'don.html', 'heart'], ['Merci d’avoir installé', 'merci.html', 'thanks'], ['Confidentialité', 'confidentialite.html', 'shield'], ['English', 'en/', 'globe']]]
  ];
  var TOP = { '': 'home', 'index.html': 'home', 'nouveautes.html': 'news', 'transport.html': 'bus', 'aide.html': 'help', 'app/': 'agenda', 'app/index.html': 'agenda', 'en/': 'globe', 'extension/': 'puzzle', 'installation.html': 'guide', 'lieux-map.html': 'pin', 'don.html': 'heart', '#demo': 'play', '#comparatif': 'compare', '#faq': 'faq' };

  /* ---------- thème ---------- */
  function getTheme() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function setTheme(t) {
    try { if (t === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch (e) {}
    applyTheme(t);
    document.querySelectorAll('.nv-theme button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.t === t)); });
  }
  function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme(getTheme());

  /* ---------- styles ---------- */
  var css = '' +
    '.nv-bar{position:sticky;top:0;z-index:900;display:flex;align-items:center;gap:10px;padding:8px 16px;background:color-mix(in srgb,var(--bg,#fff) 90%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border,#e4e4e7);font-family:var(--font,system-ui,sans-serif)}' +
    '.nv-bar .nv-spacer{flex:1}' +
    '.nv-home,.nv-burger{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border-radius:12px;border:1px solid var(--border,#e4e4e7);background:var(--surface,#fff);color:var(--text,#09090b);font:600 14.5px/1 var(--font,system-ui,sans-serif);text-decoration:none;cursor:pointer}' +
    '.nv-home:hover,.nv-burger:hover{border-color:var(--accent-2,#3d9be9)}' +
    '.nv-burger{width:44px;padding:0;justify-content:center}.nv-burger svg{width:22px;height:22px}' +
    '.topbar .nv-burger{margin-left:6px;flex-shrink:0}' +
    '.topbar .nav a .nv-i{width:18px;height:18px;margin-right:6px;vertical-align:-4px}' +
    '@media (max-width:1280px){.topbar .brand span{display:none}}' +
    '.nv-overlay{position:fixed;inset:0;z-index:950;background:rgba(9,9,11,.5);display:none}.nv-overlay.open{display:block}' +
    '.nv-panel{position:fixed;top:0;right:0;bottom:0;width:min(350px,90vw);z-index:960;background:var(--surface,#fff);color:var(--text,#09090b);border-left:1px solid var(--border,#e4e4e7);transform:translateX(100%);visibility:hidden;transition:transform .25s ease,visibility .25s;display:flex;flex-direction:column;font-family:var(--font,system-ui,sans-serif)}' +
    '.nv-panel.open{transform:none;visibility:visible;box-shadow:-12px 0 32px rgba(9,9,11,.22)}' +
    '.nv-panel header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border,#e4e4e7);font-weight:800;font-size:17px}' +
    '.nv-panel header button{width:40px;height:40px;border-radius:50%;border:1px solid var(--border,#e4e4e7);background:var(--surface-2,#f1f8fe);color:var(--text,#09090b);font-size:20px;cursor:pointer}' +
    '.nv-theme{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:12px 14px;border-bottom:1px solid var(--border,#e4e4e7)}' +
    '.nv-theme button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:12px;border:1px solid var(--border,#e4e4e7);background:var(--surface,#fff);color:var(--text,#09090b);font:600 12.5px var(--font,system-ui,sans-serif);cursor:pointer}' +
    '.nv-theme button svg{width:24px;height:24px}' +
    '.nv-theme button[aria-pressed="true"]{border-color:var(--accent,#0069a4);background:var(--accent-tint,#e6f3fd)}' +
    '.nv-panel nav{overflow-y:auto;padding:8px 10px 24px;display:flex;flex-direction:column;gap:2px}' +
    '.nv-panel nav h4{margin:14px 10px 4px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim,#52525b)}' +
    '.nv-panel nav a{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;color:var(--text,#09090b);text-decoration:none;font-weight:600;font-size:15.5px}' +
    '.nv-panel nav a:hover,.nv-panel nav a[aria-current="page"]{background:var(--accent-tint,#e6f3fd)}' +
    '.nv-panel nav a .nv-i{flex-shrink:0}' +
    '.nv-menu a{display:flex;align-items:center;gap:12px;padding:11px 4px;color:inherit;text-decoration:none;font-weight:600;border-bottom:1px solid rgba(127,127,127,.18)}' +
    '.nv-menu a:last-child{border-bottom:0}.nv-menu h4{margin:12px 0 2px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.65}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function here() { return location.href.split('#')[0].split('?')[0]; }
  function links(cur) {
    var h = '';
    L.forEach(function (g) {
      h += '<h4>' + g[0] + '</h4>';
      g[1].forEach(function (a) { var u = root + a[1]; h += '<a href="' + u + '"' + (cur && u.split('#')[0] === cur && a[1].indexOf('#') < 0 ? ' aria-current="page"' : '') + '>' + svg(a[2]) + '<span>' + a[0] + '</span></a>'; });
    });
    return h;
  }
  function build() {
    var cur = here().replace(/index\.html$/, '');
    var ov = document.createElement('div'); ov.className = 'nv-overlay';
    var p = document.createElement('div'); p.className = 'nv-panel'; p.id = 'nvPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Menu'); p.setAttribute('aria-hidden', 'true');
    var t = getTheme();
    function tb(k, label, ic) { return '<button type="button" data-t="' + k + '" aria-pressed="' + (t === k) + '">' + svg(ic) + label + '</button>'; }
    p.innerHTML = '<header><span>Menu</span><button type="button" aria-label="Fermer le menu">✕</button></header>' +
      '<div class="nv-theme" role="group" aria-label="Thème">' + tb('light', 'Clair', 'sun') + tb('dark', 'Sombre', 'moon') + tb('auto', 'Auto', 'auto') + '</div><nav>' + links(cur) + '</nav>';
    document.body.appendChild(ov); document.body.appendChild(p);
    function set(o) { ov.classList.toggle('open', o); p.classList.toggle('open', o); p.setAttribute('aria-hidden', String(!o)); document.body.style.overflow = o ? 'hidden' : ''; if (o) p.querySelector('header button').focus(); }
    ov.addEventListener('click', function () { set(false); });
    p.querySelector('header button').addEventListener('click', function () { set(false); });
    p.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); var b = e.target.closest('.nv-theme button'); if (b) setTheme(b.dataset.t); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    return set;
  }
  function decorateTop() {
    document.querySelectorAll('.topbar .nav a').forEach(function (a) {
      if (a.querySelector('.nv-i')) return;
      var h = a.getAttribute('href') || '', k = TOP[h] || TOP[h.replace(/^(\.\.\/)+/, '')] || TOP[h.replace(/^.*(#.*)$/, '$1')] || 'home';
      a.insertAdjacentHTML('afterbegin', svg(k));
    });
  }
  function init() {
    var set = build();
    window.UCA_NAV = { open: function () { set(true); }, close: function () { set(false); }, menuHtml: function () { return '<div class="nv-menu">' + links(null) + '</div>'; }, homeUrl: root };
    decorateTop();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'nv-burger'; b.setAttribute('aria-label', 'Ouvrir le menu'); b.setAttribute('aria-controls', 'nvPanel'); b.innerHTML = svg('burger');
    b.addEventListener('click', function () { set(true); });
    var tb = document.querySelector('.topbar .wrap');
    if (tb) { tb.appendChild(b); return; }
    if (document.body.hasAttribute('data-nv-none')) return;   // pages qui ont leur propre barre (application)
    var bar = document.createElement('div'); bar.className = 'nv-bar';
    bar.innerHTML = '<a class="nv-home" href="' + root + '">' + svg('home') + 'Accueil</a><span class="nv-spacer"></span>';
    bar.appendChild(b);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
