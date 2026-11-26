/* Menu hamburger commun (site, pages publiques et application) : une icône SVG colorée et différente par entrée,
   bascule Clair / Sombre / Auto (soleil, lune), bouton « Accueil » sur les pages sans barre d'en-tête.
   Chemins relatifs à ce script (racine du site). Styles injectés ici : fonctionne aussi dans les pages à palette propre. */
(function () {
  "use strict";
  var s = document.currentScript, root = new URL('.', s.src).href;
  var KEY = 'uca-site-theme';

  /* ---------- écran de chargement : seulement si la page met plus de 2 s à se charger complètement ---------- */
  (function () {
    try {
      if (document.readyState === 'complete' || document.getElementById('ucaLoading')) return;
      var wait = Math.max(0, 2000 - (window.performance && performance.now ? performance.now() : 0)), box = null, bar = null, pct = 0, timer = 0, done = false;
      function show() {
        if (done || document.readyState === 'complete') return;
        var st = document.createElement('style');
        st.textContent = '#ucaLoading{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--bg,#fff);color:var(--text,#111);font:600 17px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:1;transition:opacity .3s}' +
          '#ucaLoading.off{opacity:0;pointer-events:none}#ucaLoading .in{display:grid;gap:14px;justify-items:center;text-align:center;padding:24px;width:min(86vw,360px)}' +
          '#ucaLoading .lg{width:72px;height:72px;border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.18)}#ucaLoading .sp{width:100%;height:8px;border-radius:99px;background:rgba(127,127,127,.25);overflow:hidden}' +
          '#ucaLoading .sp i{display:block;height:100%;width:8%;border-radius:99px;background:var(--accent,#0b6fa8);transition:width .4s}#ucaLoading small{font-weight:500;opacity:.7;font-size:14px}' +
          '@media (prefers-reduced-motion:reduce){#ucaLoading,#ucaLoading .sp i{transition:none}}';
        document.head.appendChild(st);
        box = document.createElement('div'); box.id = 'ucaLoading'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
        box.innerHTML = '<div class="in"><img class="lg" alt="" src="' + root + 'app/icons/icon-192.png"><div>Chargement du site…</div><div class="sp"><i></i></div><small>Encore quelques secondes</small></div>';
        document.body.appendChild(box); bar = box.querySelector('i');
        timer = setInterval(function () { pct += (92 - pct) * 0.12; bar.style.width = pct.toFixed(0) + '%'; }, 300);
      }
      function hide() {
        done = true; clearInterval(timer);
        if (!box) return;
        bar.style.width = '100%'; box.classList.add('off');
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 400);
      }
      setTimeout(show, wait);
      window.addEventListener('load', hide);
    } catch (e) { /* l'écran de chargement est un confort : jamais bloquant */ }
  })();

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

  /* ---------- toutes les pages : [titre, lien, icône, description courte, mots-clés pour la recherche] ---------- */
  var L = [
    ['Utiliser', [
      ['Accueil', '', 'home', 'My UCA en une minute : ce que ça fait.', 'presentation site demo'],
      ['Agenda en ligne', 'app/shell.html#home', 'agenda', 'Ton emploi du temps, sans rien installer.', 'edt cours planning odin calendrier web'],
      ['Aide', 'aide.html', 'help', 'Questions fréquentes et premiers pas.', 'faq probleme question support connexion'],
      ['Notes Moodle', 'synchro-moodle.html', 'guide', 'Ajoute tes notes Moodle à ton relevé.', 'moodle synchro synchronisation notes valider refuser corbeille coefficient matiere'],
      ['Nouveautés', 'nouveautes.html', 'news', 'Ce qui change à chaque version.', 'version changelog quoi de neuf historique']
    ]],
    ['Installer', [
      ['Télécharger l’appli', 'appli.html', 'phone', 'Android ou iPhone : juste le lien.', 'apk android iphone ios pwa telephone mobile application telecharger telechargement appli app'],
      ['Installer l’app pas à pas', 'app-download.html', 'install', 'Choisis ton appareil, on te guide.', 'ordinateur windows mac linux telephone guide installer'],
      ['Extension navigateur', 'extension/', 'puzzle', 'Pour Chrome, Edge, Brave et Firefox.', 'zip chrome edge firefox brave extension telecharger'],
      ['Installateurs automatiques', 'extension/#installateurs', 'install', 'Un fichier qui installe tout seul.', 'bat command sh installateur windows mac linux automatique'],
      ['Aide à l’installation', 'installation.html', 'guide', 'Chaque étape en images.', 'tutoriel images captures pas a pas'],
      ['Appli Android (détails)', 'telecharger/', 'phone', 'Captures, versions et téléchargement APK.', 'apk android telecharger captures'],
      ['Appli sur iPhone et PC', 'app/install.html', 'agenda', 'Ajouter l’agenda à l’écran d’accueil.', 'pwa iphone ios safari ecran accueil installer']
    ]],
    ['Mettre à jour', [
      ['Pilote automatique', 'mise-a-jour.html', 'update', 'Met l’extension à jour tout seul.', 'maj mise a jour bat sh command script pilote automatique recharger'],
      ['Statut et mise à jour', 'statut.html', 'update', 'Vois ta version et mets à jour en un clic.', 'statut version detecter verifier a jour mettre a jour directe autoriser']
    ]],
    ['Pratique', [
      ['Transports', 'transport.html', 'bus', 'Bus et tram vers les campus.', 'bus tram t2c horaires mobilite'],
      ['Carte des lieux', 'lieux-map.html', 'pin', 'Trouver une salle ou un campus.', 'carte plan salle batiment campus']
    ]],
    ['Projet', [
      ['Soutenir le projet', 'don.html', 'heart', 'Un don, si l’appli te sert.', 'don paypal crypto soutenir']
      , ['Merci d’avoir installé', 'merci.html', 'thanks', 'Premiers pas après l’installation.', 'merci bienvenue premiers pas ouvrir agenda']
      , ['Confidentialité', 'confidentialite.html', 'shield', 'Aucune donnée envoyée à un tiers.', 'vie privee donnees rgpd securite']
      , ['English', 'en/', 'globe', 'The site in English.', 'anglais english']
    ]]
  ];
  var TOP = { '': 'home', 'index.html': 'home', 'nouveautes.html': 'news', 'transport.html': 'bus', 'aide.html': 'help', 'app/': 'agenda', 'app/index.html': 'agenda', 'en/': 'globe', 'extension/': 'puzzle', 'installation.html': 'guide', 'mise-a-jour.html': 'update', 'statut.html': 'update', 'appli.html': 'phone', 'lieux-map.html': 'pin', 'don.html': 'heart', '#demo': 'play', '#comparatif': 'compare', '#faq': 'faq' };
  I.search = ['currentColor', '', 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM20 20l-4.6-4.6'];

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

  /* ---------- styles : descriptions sous les liens, recherche ---------- */
  var css2 = '' +
    '.nv-panel nav a{align-items:flex-start;padding:9px 12px}' +
    '.nv-panel nav a .nv-i{margin-top:2px}' +
    '.nv-t{display:flex;flex-direction:column;gap:1px;min-width:0}' +
    '.nv-t small{font-weight:500;font-size:13px;line-height:1.35;color:var(--text-dim,#52525b)}' +
    '.nv-menu a{align-items:flex-start}.nv-menu .nv-t small{opacity:.75}' +
    '.nv-find{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--border,#e4e4e7);background:var(--surface,#fff);color:var(--text-dim,#52525b);font:500 14px/1 var(--font,system-ui,sans-serif);cursor:pointer;flex-shrink:0}' +
    '.nv-find:hover{border-color:var(--accent-2,#3d9be9)}.nv-find svg{width:18px;height:18px}' +
    '.nv-find kbd{font:600 11px var(--font,system-ui,sans-serif);padding:2px 6px;border-radius:6px;border:1px solid var(--border,#e4e4e7)}' +
    '@media (max-width:640px){.nv-find .nv-fl,.nv-find kbd{display:none}.nv-find{width:44px;padding:0;justify-content:center}}' +
    '.topbar .nv-find{margin-left:6px}' +
    '.nv-sbox{position:fixed;inset:0;z-index:970;background:rgba(9,9,11,.5);display:none;align-items:flex-start;justify-content:center;padding:10vh 16px 16px}' +
    '.nv-sbox.open{display:flex}' +
    '.nv-sdlg{width:min(560px,100%);max-height:78vh;display:flex;flex-direction:column;border-radius:16px;background:var(--surface,#fff);color:var(--text,#09090b);border:1px solid var(--border,#e4e4e7);box-shadow:0 24px 60px rgba(9,9,11,.3);overflow:hidden;font-family:var(--font,system-ui,sans-serif)}' +
    '.nv-sin{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border,#e4e4e7)}.nv-sin svg{width:20px;height:20px;flex-shrink:0}' +
    '.nv-sin input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:500 17px var(--font,system-ui,sans-serif);min-height:36px}' +
    '.nv-sin button{border:1px solid var(--border,#e4e4e7);background:transparent;color:inherit;border-radius:8px;padding:6px 10px;font:600 12.5px var(--font,system-ui,sans-serif);cursor:pointer}' +
    '.nv-sres{overflow-y:auto;padding:6px}.nv-sres a{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:10px;color:inherit;text-decoration:none;font-weight:600}' +
    '.nv-sres a.on,.nv-sres a:hover{background:var(--accent-tint,#e6f3fd)}.nv-sres p{margin:14px;color:var(--text-dim,#52525b);font-size:14px}' +
    '.nv-pfind{margin:10px 14px 0;width:calc(100% - 28px);justify-content:flex-start}';
  var st2 = document.createElement('style'); st2.textContent = css2; document.head.appendChild(st2);

  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function item(a, cur) {
    var u = root + a[1];
    return '<a href="' + u + '"' + (cur && u.split('#')[0] === cur && a[1].indexOf('#') < 0 ? ' aria-current="page"' : '') + '>' + svg(a[2]) + '<span class="nv-t"><span>' + a[0] + '</span><small>' + a[3] + '</small></span></a>';
  }
  function here() { return location.href.split('#')[0].split('?')[0]; }
  function links(cur) {
    var h = '';
    L.forEach(function (g) { h += '<h4>' + g[0] + '</h4>'; g[1].forEach(function (a) { h += item(a, cur); }); });
    return h;
  }
  /* ---------- recherche globale : titre, description et mots-clés de chaque page, sans accents ---------- */
  function search(q) {
    var words = norm(q).split(/[\s'’-]+/).filter(function (w) { return w.length > 1; }), out = [];
    L.forEach(function (g) {
      g[1].forEach(function (a) {
        var title = norm(a[0]), hay = title + ' ' + norm(a[3]) + ' ' + norm(a[4]) + ' ' + norm(g[0]);
        if (!words.length) { out.push([0, a]); return; }
        var score = 0;
        for (var i = 0; i < words.length; i++) {
          var w = words[i], stem = w.length > 6 ? w.slice(0, w.length - 3) : w;   // « telechargement » trouve « telecharger »
          if (hay.indexOf(w) < 0 && hay.indexOf(stem) < 0) return;
          score += title.indexOf(stem) >= 0 ? 3 : 1;
        }
        if (words.length > 1 && hay.indexOf(words.join(' ')) >= 0) score += 4;   // expression entière (« mise a jour »)
        out.push([score, a]);
      });
    });
    return out.sort(function (x, y) { return y[0] - x[0]; }).map(function (x) { return x[1]; });
  }
  function buildSearch() {
    var box = document.createElement('div'); box.className = 'nv-sbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Rechercher une page');
    box.innerHTML = '<div class="nv-sdlg"><div class="nv-sin">' + svg('search') + '<input type="search" id="nvSearch" placeholder="Chercher une page : appli, mise à jour, carte…" aria-label="Chercher une page" autocomplete="off"><button type="button">Échap</button></div><div class="nv-sres" id="nvRes" role="listbox"></div></div>';
    document.body.appendChild(box);
    var input = box.querySelector('input'), res = box.querySelector('.nv-sres'), sel = 0;
    function render() {
      var r = search(input.value); sel = 0;
      res.innerHTML = r.length ? r.map(function (a, i) { return item(a, null).replace('<a ', '<a role="option" class="' + (i === 0 ? 'on' : '') + '" '); }).join('') : '<p>Aucune page trouvée. Essaie « appli », « mise à jour » ou « aide ».</p>';
    }
    function mark() { var as = res.querySelectorAll('a'); as.forEach(function (a, i) { a.classList.toggle('on', i === sel); }); if (as[sel]) as[sel].scrollIntoView({ block: 'nearest' }); }
    function set(o) { box.classList.toggle('open', o); document.body.style.overflow = o ? 'hidden' : ''; if (o) { input.value = ''; render(); setTimeout(function () { input.focus(); }, 30); } }
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      var as = res.querySelectorAll('a');
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, as.length - 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
      else if (e.key === 'Enter' && as[sel]) { e.preventDefault(); location.href = as[sel].href; set(false); }
    });
    box.addEventListener('click', function (e) { if (e.target === box || e.target.closest('.nv-sin button')) set(false); else if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.classList.contains('open')) set(false);
      var tag = (e.target && e.target.tagName) || '';
      if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.target.isContentEditable) { e.preventDefault(); set(true); }
    });
    return set;
  }
  function findBtn(openSearch, extra) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'nv-find' + (extra ? ' ' + extra : ''); b.setAttribute('aria-label', 'Rechercher une page');
    b.innerHTML = svg('search') + '<span class="nv-fl">Rechercher</span><kbd>/</kbd>';
    b.addEventListener('click', function () { openSearch(true); });
    return b;
  }
  function build(openSearch) {
    var cur = here().replace(/index\.html$/, '');
    var ov = document.createElement('div'); ov.className = 'nv-overlay';
    var p = document.createElement('div'); p.className = 'nv-panel'; p.id = 'nvPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Menu'); p.setAttribute('aria-hidden', 'true');
    var t = getTheme();
    function tb(k, label, ic) { return '<button type="button" data-t="' + k + '" aria-pressed="' + (t === k) + '">' + svg(ic) + label + '</button>'; }
    p.innerHTML = '<header><span>Menu</span><button type="button" aria-label="Fermer le menu">✕</button></header>' +
      '<div class="nv-theme" role="group" aria-label="Thème">' + tb('light', 'Clair', 'sun') + tb('dark', 'Sombre', 'moon') + tb('auto', 'Auto', 'auto') + '</div><nav>' + links(cur) + '</nav>';
    var pf = findBtn(function () { set(false); openSearch(true); }, 'nv-pfind'); p.insertBefore(pf, p.querySelector('.nv-theme'));
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
    var openSearch = buildSearch();
    var set = build(openSearch);
    window.UCA_NAV = { open: function () { set(true); }, close: function () { set(false); }, search: function () { openSearch(true); }, menuHtml: function () { return '<div class="nv-menu">' + links(null) + '</div>'; }, homeUrl: root };
    decorateTop();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'nv-burger'; b.setAttribute('aria-label', 'Ouvrir le menu'); b.setAttribute('aria-controls', 'nvPanel'); b.innerHTML = svg('burger');
    b.addEventListener('click', function () { set(true); });
    var tb = document.querySelector('.topbar .wrap');
    if (tb) { tb.appendChild(findBtn(openSearch)); tb.appendChild(b); return; }
    if (document.body.hasAttribute('data-nv-none')) return;   // pages qui ont leur propre barre (application)
    var bar = document.createElement('header'); bar.className = 'nv-bar';
    bar.innerHTML = '<a class="nv-home" href="' + root + '">' + svg('home') + 'Accueil</a><span class="nv-spacer"></span>';
    bar.appendChild(findBtn(openSearch));
    bar.appendChild(b);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
