/* Menu hamburger + bouton « Accueil » communs à toutes les pages publiques. Chemins relatifs à ce script (racine du site). */
(function () {
  var s = document.currentScript, root = new URL('.', s.src).href;
  var L = [
    ['Site', [['Accueil', ''], ['Agenda en ligne', 'app/'], ['Nouveautés', 'nouveautes.html'], ['Aide', 'aide.html'], ['Transports', 'transport.html'], ['Carte des lieux', 'lieux-map.html']]],
    ['Installer', [['Télécharger l’extension (ZIP)', 'extension/'], ['Installateurs Windows · Mac · Linux', 'extension/#installateurs'], ['Application Android (APK)', 'telecharger/'], ['Mettre à jour l’extension', 'extension/#maj']]],
    ['Projet', [['Soutenir le projet (don)', 'don.html'], ['Merci d’avoir installé', 'merci.html'], ['Confidentialité', 'confidentialite.html'], ['English', 'en/']]]
  ];
  var ICO_HOME = '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>';
  var ICO_BURGER = '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  function here() { return location.href.split('#')[0].split('?')[0]; }
  function build() {
    var cur = here().replace(/index\.html$/, '');
    var ov = document.createElement('div'); ov.className = 'nv-overlay';
    var p = document.createElement('div'); p.className = 'nv-panel'; p.id = 'nvPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Menu'); p.setAttribute('aria-hidden', 'true');
    var h = '<header><span>Menu</span><button type="button" aria-label="Fermer le menu">✕</button></header><nav>';
    L.forEach(function (g) {
      h += '<h4>' + g[0] + '</h4>';
      g[1].forEach(function (a) { var u = root + a[1]; h += '<a href="' + u + '"' + (u.split('#')[0] === cur && a[1].indexOf('#') < 0 ? ' aria-current="page"' : '') + '>' + a[0] + '</a>'; });
    });
    p.innerHTML = h + '</nav>';
    document.body.appendChild(ov); document.body.appendChild(p);
    function set(o) { ov.classList.toggle('open', o); p.classList.toggle('open', o); p.setAttribute('aria-hidden', String(!o)); document.body.style.overflow = o ? 'hidden' : ''; if (o) p.querySelector('button').focus(); }
    ov.addEventListener('click', function () { set(false); });
    p.querySelector('button').addEventListener('click', function () { set(false); });
    p.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    return set;
  }
  function init() {
    var set = build();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'nv-burger'; b.setAttribute('aria-label', 'Ouvrir le menu'); b.setAttribute('aria-controls', 'nvPanel'); b.innerHTML = ICO_BURGER;
    b.addEventListener('click', function () { set(true); });
    var tb = document.querySelector('.topbar .wrap');
    if (tb) { tb.appendChild(b); return; }
    var bar = document.createElement('div'); bar.className = 'nv-bar';
    bar.innerHTML = '<a class="nv-home" href="' + root + '">' + ICO_HOME + 'Accueil</a><span class="nv-spacer"></span>';
    bar.appendChild(b);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
