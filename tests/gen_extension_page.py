"""Génère extension/index.html (page de téléchargement du ZIP de l'extension, mode développeur Chrome)
à partir du style de telecharger/index.html, et extension/uca-extension-chrome.zip (paquet sans aucune donnée perso).

Usage : python -I -X utf8 tests/gen_extension_page.py
"""
import re
import subprocess
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "extension"
ZIP = "uca-extension-chrome.zip"
DL = '<svg viewBox="0 0 24 24"><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></svg>'

BOTH_JS_UNUSED = """  var both = document.getElementById("dlBoth");
  if (both) both.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelectorAll("#choix a[data-dl]").forEach(function (a, k) { setTimeout(function () { a.click(); }, k * 900); });
  });
"""

BODY = """<body>
<div class="blob b1"></div><div class="blob b2"></div>
<div class="wrap">
  <header><img src="../app/icons/icon-192.png" alt="">My UCA<a class="small" href="../">Site de l'extension →</a></header>

  <div class="hero">
    <div>
      <div class="tag"><i></i>Chrome · Edge · Brave · <span id="ver">dernière version</span></div>
      <h1>L'extension,<br><span>en un ZIP.</span></h1>
      <p class="lead">Télécharge le fichier, décompresse-le, ajoute-le à Chrome en mode développeur : ton emploi du temps, tes notes et tes absences de l'UCA, sans compte et sans serveur tiers.</p>
      <div class="cta">
        <a class="dl" id="dlTop" href="@ZIP@" download>
          @DL@
          <span>Télécharger le ZIP<small id="size">Chrome, Edge, Brave · <span class="sz" data-sz="zip">?</span></small></span>
        </a>
        <a class="ghost" href="#installer">Comment l'ajouter ?</a>
      </div>
      <p class="meta">ZIP propre : uniquement le code de l'extension, <b>aucune donnée personnelle</b> (les données Odin restent dans le navigateur de chacun). Code source ouvert sur <a href="https://github.com/kiricoucou/uca-extension">GitHub</a>.</p>
    </div>
    <div>
      <div class="phone"><div class="screen" id="screen">
        <img class="on" src="../telecharger/shots/agenda-studio.webp" alt="Agenda du jour">
        <img src="../telecharger/shots/home-studio.webp" alt="Accueil avec le statut des services" loading="lazy">
        <img src="../telecharger/shots/agenda-carnet.webp" alt="Agenda, design Carnet" loading="lazy">
        <img src="../telecharger/shots/agenda-professionnel.webp" alt="Agenda, design Professionnel" loading="lazy">
      </div></div>
      <div class="dots" id="dots"></div>
    </div>
  </div>

  <section class="reveal" id="choix">
    <h2>Que veux-tu télécharger ?</h2>
    <p class="sub">L'extension pour ton ordinateur, l'application pour ton téléphone Android, ou les deux d'un coup.</p>
    <div class="grid">
      <div class="card"><div class="ic">💻</div><h3>Extension (ZIP)</h3><p>Chrome, Edge, Brave, à ajouter en mode développeur.</p><p class="btn-row"><a class="ghost" data-dl="zip" href="@ZIP@" download>Télécharger le ZIP · <span class="sz" data-sz="zip">?</span></a></p></div>
      <div class="card"><div class="ic">📱</div><h3>Application (APK)</h3><p>Android 7 ou plus récent, se connecte seule à Odin.</p><p class="btn-row"><a class="ghost" data-dl="apk" href="https://github.com/kiricoucou/uca-extension/raw/main/EdtUca.apk" download>Télécharger l'APK · <span class="sz" data-sz="apk">?</span></a></p></div>
      <div class="card"><div class="ic">📦</div><h3>Les deux</h3><p>Le ZIP et l'APK l'un après l'autre (autorise les téléchargements multiples si le navigateur le demande).</p><p class="btn-row"><a class="dl" id="dlBoth" href="#choix">Tout télécharger · <span class="sz" data-sz="both">?</span></a></p></div>
    </div>
  </section>

  <section class="reveal" id="installateurs">
    <h2>Installateurs automatiques</h2>
    <p class="sub">Une fenêtre te guide : où installer, où télécharger, quels navigateurs (un ou plusieurs), barre de progression. Sans droits administrateur, ils récupèrent la dernière version, ferment tes navigateurs (après ton accord), puis ouvrent la page de connexion de l'extension et une page de remerciement. Sur Windows, lance-le en administrateur (clic droit, « Exécuter en tant qu'administrateur ») pour qu'il installe tout seul : navigateurs fermés automatiquement, Firefox Developer/Nightly/ESR installé pour tous les profils. À la fin, l'assistant affiche le dossier de l'extension avec « Copier le chemin » et « Ouvrir le dossier » (s'il est introuvable : Affichage &gt; Afficher &gt; Éléments masqués).</p>
    <div class="grid">
      <div class="card"><div class="ic">🪟</div><h3>Windows</h3><p>Chrome, Edge, Brave, Vivaldi, Firefox. Double-clique le fichier .bat.</p><p class="btn-row"><a class="dl" href="installer-windows.bat" download>Installateur Windows</a></p></div>
      <div class="card"><div class="ic">🍎</div><h3>macOS</h3><p>Chrome, Edge, Brave, Vivaldi, Firefox. Dans le Terminal : <code>bash ~/Downloads/installer-mac.command</code> (ou double-clic après <code>chmod +x</code>).</p><p class="btn-row"><a class="dl" href="installer-mac.command" download>Installateur macOS</a></p></div>
      <div class="card"><div class="ic">🐧</div><h3>Linux</h3><p>Chromium, Chrome, Brave, Edge, Firefox. Lance <code>bash install-linux.sh</code>.</p><p class="btn-row"><a class="dl" href="install-linux.sh" download>Installateur Linux</a></p></div>
    </div>
    <p class="sub" style="margin-top:16px">Limite imposée par les navigateurs : Chrome (v137 et plus) refuse le chargement automatique d'une extension hors magasin, et Firefox standard refuse les extensions non signées de façon permanente. L'installateur le détecte, ouvre la bonne page et te guide en deux clics. Edge, Brave et Vivaldi chargent l'extension tout seuls (raccourci créé sur Windows).</p>
  </section>

  <section class="reveal" id="installer">
    <h2>Ajouter l'extension en 2 minutes</h2>
    <p class="sub">Elle n'est pas (encore) sur le Chrome Web Store : on la charge à la main, une seule fois. Trois étapes courtes.</p>
    <a class="tuto-cta" href="../installation.html">
      <span class="tc-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3z" fill="currentColor"/><path d="M8 21h8"/></svg></span>
      <span class="tc-txt"><b>Voir le tutoriel en images, étape par étape</b><span>Chaque étape en vraie capture d'écran, avec une flèche sur l'endroit où cliquer.</span></span>
      <span class="tuto-big">Ouvrir le tutoriel <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
    </a>
    <div class="steps">
      <div class="step"><h3>Télécharge et décompresse</h3>
        <div class="st-body">
        <ol class="sub-steps">
          <li>Clique sur <b>« Télécharger le ZIP »</b>, en haut de cette page.</li>
          <li>Dans Téléchargements, clic droit sur le fichier, puis <b>« Extraire tout… »</b> (Mac : double-clic).</li>
          <li>Garde le dossier obtenu : <b>ne le supprime pas et ne le déplace plus</b>, Chrome le relit à chaque démarrage.</li>
        </ol>
        <details class="more"><summary>Plus de précisions</summary>
          <p>Le dossier contient directement <code>manifest.json</code>. Choisis un dossier qui t'appartient, comme <code>Bureau\\extension_uca_chrome</code> (un sous-dossier de ton Bureau), <b>pas Documents ni Bureau eux-mêmes</b> : Windows y cache un fichier <code>desktop.ini</code> que Chrome refuse.</p>
          <p>Si Chrome affiche malgré tout « desktop.ini … illegal », double-clique <code>nettoyer-dossier-extension.bat</code>, déjà présent à côté de <code>manifest.json</code>.</p>
        </details></div>
        <div class="st-art" aria-hidden="true"><svg viewBox="0 0 320 150" fill="none"><rect x="14" y="30" width="96" height="92" rx="14" fill="currentColor" opacity=".12"/><rect x="28" y="44" width="68" height="64" rx="8" stroke="currentColor" stroke-width="3"/><path d="M62 44v64" stroke="currentColor" stroke-width="3" stroke-dasharray="6 6"/><text x="62" y="134" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">.zip</text><path d="M126 76h64" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="m178 62 14 14-14 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M214 56h30l10 12h46a8 8 0 0 1 8 8v46a8 8 0 0 1-8 8h-86a8 8 0 0 1-8-8V64a8 8 0 0 1 8-8z" fill="currentColor" opacity=".16" stroke="currentColor" stroke-width="3"/><text x="262" y="112" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">dossier</text></svg></div></div>
      <div class="step"><h3>Active le mode développeur</h3>
        <div class="st-body">
        <ol class="sub-steps">
          <li>Dans un nouvel onglet, ouvre <code>chrome://extensions</code> (Edge : <code>edge://extensions</code>).</li>
          <li>En haut à droite, active <b>« Mode développeur »</b>.</li>
          <li>Trois boutons apparaissent : tu vas utiliser <b>« Charger l'extension non empaquetée »</b>.</li>
        </ol></div>
        <button type="button" class="shot-link" data-full="tuto/etape-2-mode-developpeur.webp" data-cap="Étape 2 : « Mode développeur » activé en haut à droite, avec les trois boutons juste dessous"><img src="tuto/etape-2-mode-developpeur.webp" width="1024" height="610" loading="lazy" alt="Page chrome://extensions avec « Mode développeur » activé en haut à droite et le bouton « Charger l'extension non empaquetée »"><span class="zoom">🔍 Agrandir</span></button></div>
      <div class="step"><h3>Charge le dossier</h3>
        <div class="st-body">
        <ol class="sub-steps">
          <li>Clique sur <b>« Charger l'extension non empaquetée »</b>.</li>
          <li>Choisis le <b>dossier</b> décompressé (pas le fichier .zip), puis <b>« Sélectionner un dossier »</b>.</li>
          <li>« Emploi du temps UCA » apparaît dans la liste : c'est installé.</li>
        </ol>
        <details class="more"><summary>Plus de précisions</summary>
          <p>Clique ensuite sur l'icône puzzle de la barre d'outils, puis sur l'épingle à côté de l'extension pour l'avoir toujours sous la main.</p>
        </details></div>
        <button type="button" class="shot-link" data-full="tuto/etape-3-choisir-le-dossier.webp" data-cap="Étape 3 : le dossier décompressé est sélectionné, clique sur « Sélectionner un dossier »"><img src="tuto/etape-3-choisir-le-dossier.webp" width="1024" height="572" loading="lazy" alt="Fenêtre « Sélectionner le répertoire de l'extension » avec le dossier décompressé sélectionné"><span class="zoom">🔍 Agrandir</span></button></div>
    </div>
    <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Capture agrandie" hidden>
      <button type="button" class="lb-close" id="lbClose" aria-label="Fermer">✕</button>
      <figure><img id="lbImg" alt=""><figcaption id="lbCap"></figcaption></figure>
    </div>
  </section>

  <section class="reveal">
    <h2>Ce que fait l'extension</h2>
    <p class="sub">Elle lit ton emploi du temps et tes notes directement sur Odin, avec ta propre session. Rien n'est envoyé ailleurs.</p>
    <div class="grid">
      <div class="card"><div class="ic">📅</div><h3>Emploi du temps</h3><p>Vue liste du jour, jour en blocs, 3 jours, semaine et mois.</p></div>
      <div class="card"><div class="ic">📊</div><h3>Notes et absences</h3><p>Moyennes, évolution, barème, alerte quand une note arrive.</p></div>
      <div class="card"><div class="ic">🎓</div><h3>Notes Moodle</h3><p>Cherche tes notes sur Moodle ; tu valides ou refuses chacune. <a href="../synchro-moodle.html">Mode d'emploi</a></p></div>
      <div class="card"><div class="ic">🔔</div><h3>Notifications</h3><p>Cours déplacé, salle changée ou annulé : tu es prévenu.</p></div>
      <div class="card"><div class="ic">📱</div><h3>Vers ton téléphone</h3><p>Envoie tes données à l'app (QR, lien chiffré ou fichier), sans serveur.</p></div>
      <div class="card"><div class="ic">🟢</div><h3>Statut des services</h3><p>Odin, CAS, Moodle en panne ? Tu le sais avant de perdre ton temps.</p></div>
      <div class="card"><div class="ic">🎨</div><h3>5 designs</h3><p>Studio, Anime, Professionnel, Bulletin ou Carnet : mêmes fonctions, ton style.</p></div>
    </div>
  </section>

  <section class="reveal">
    <h2>Questions</h2>
    <details><summary>Est-ce que le ZIP contient mes données ?</summary><p>Non. Le ZIP est généré depuis le code public : cours, notes et identifiants n'existent que dans le navigateur de chacun. Chaque personne démarre à vide et se connecte avec son propre compte UCA.</p></details>
    <details><summary>Et mon mot de passe ?</summary><p>Il est tapé sur la vraie page de connexion de l'UCA (CAS). L'extension ne le voit pas et ne l'enregistre pas.</p></details>
    <details><summary>Chrome affiche « Désactiver les extensions en mode développeur »</summary><p>Message normal pour toute extension chargée à la main : ferme-le sans désactiver. Ne déplace ni ne supprime le dossier décompressé, sinon l'extension disparaît.</p></details>
    <details id="desktop-ini"><summary>Chrome affiche « Cannot load extension with file or directory name desktop.ini »</summary><p>Windows a ajouté un fichier caché <code>desktop.ini</code> dans le dossier choisi (dossier personnalisé, synchronisé avec OneDrive, ou choisi à la racine de Documents/Bureau), et Chrome refuse alors de le charger. Télécharge <a href="nettoyer-dossier-extension.bat" download>nettoyer-dossier-extension.bat</a>, mets-le dans le dossier de l'extension (à côté de <code>manifest.json</code>) puis double-clique : il supprime ces fichiers. Reviens ensuite dans <code>chrome://extensions</code> et charge de nouveau le dossier. Astuce : choisis un dossier qui lui est propre, comme <code>Bureau\\extension_uca_chrome</code>, jamais Documents ou Bureau eux-mêmes. L'<a href="installer-windows.bat" download>installateur Windows</a> supprime ces fichiers tout seul.</p></details>
    <details id="maj"><summary>Comment mettre à jour ?</summary><p>Le plus simple : télécharge le script de ton système, <a href="maj-extension.bat" download>maj-extension.bat</a> (Windows), <a href="maj-extension.command" download>maj-extension.command</a> (macOS) ou <a href="maj-extension.sh" download>maj-extension.sh</a> (Linux), sans droits administrateur, et lance-le. Il retrouve tout seul le dossier de l'extension dans ton navigateur, te le montre (« Ouvrir le dossier », puis « Valider »), cherche une nouvelle version et met l'extension à jour s'il y en a une. <a href="../mise-a-jour.html">Voir la présentation, étape par étape</a>. Ensuite il te reste à cliquer « Recharger » dans <code>chrome://extensions</code> (ou à attendre la vérification automatique). À la main : retélécharge le ZIP, remplace le contenu du dossier et recharge. L'extension te prévient quand une nouvelle version existe. Le script est ajouté dans le ZIP, à côté de <code>manifest.json</code>. Firefox : le même script reconnaît un dossier Firefox (donne-lui le dossier : <code>maj-extension.bat "C:\\chemin\\dossier"</code>), télécharge le paquet Firefox, puis clique « Recharger » dans <code>about:debugging#/runtime/this-firefox</code>. Firefox ne permet pas la mise à jour en un clic.</p></details>
    <details id="linux"><summary>Linux : installation automatique sans sudo</summary><p>Télécharge <a href="install-linux.sh" download>install-linux.sh</a> puis lance <code>bash install-linux.sh</code> (ou, en une ligne : <code>curl -fsSLO https://kiricoucou.github.io/uca-extension/extension/install-linux.sh &amp;&amp; bash install-linux.sh</code>). Il te demande (dans ton explorateur de fichiers si zenity / kdialog est présent) où installer l'extension, télécharge la dernière version, puis te guide pour Chrome / Chromium / Brave / Edge. Pour Firefox il vérifie ton profil et l'édition (mode développeur), te demande l'accord, puis installe l'extension. Aucun sudo, rien n'est écrit hors de ton dossier personnel. Firefox « release » refuse de façon permanente toute extension non signée : le script prépare alors un chargement temporaire, ou utilise Firefox Developer Edition / Nightly / ESR pour une installation permanente.</p></details>
    <details><summary>Firefox, iPhone, Android ?</summary><p>Android : <a href="../telecharger/">l'application APK</a>. iPhone : <a href="../app/">la version web</a>, à ajouter à l'écran d'accueil.</p></details>
    <details><summary>C'est officiel ?</summary><p>Non. Projet étudiant indépendant, sans lien avec l'Université Clermont Auvergne.</p></details>
  </section>

  <section class="reveal">
    <div class="final">
      <h2>Prêt ?</h2>
      <p class="sub" style="margin:0 auto 6px">Gratuit, sans pub, sans compte à créer.</p>
      <div class="cta"><a class="dl" href="@ZIP@" download>@DL@<span>Télécharger le ZIP<small><span class="sz" data-sz="zip">?</span></small></span></a></div>
    </div>
  </section>

  <footer>My UCA · extension non officielle · <a href="../confidentialite.html">Confidentialité</a> · <a href="../nouveautes.html">Nouveautés</a></footer>
</div>
"""


LB_CSS = '.sub-steps{margin:8px 0 0;padding-left:20px;font-size:14.5px;color:var(--dim)}.sub-steps li{margin:6px 0}.sub-steps b{color:var(--text)}button.shot-link{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in;position:relative;margin-top:14px;text-align:left;font:inherit}.shot-link .zoom{position:absolute;right:10px;bottom:10px;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:rgba(22,24,29,.82);color:#fff}.lightbox{position:fixed;inset:0;z-index:3000;background:rgba(10,12,16,.86);display:flex;align-items:center;justify-content:center;padding:56px 16px 24px}.lightbox[hidden]{display:none}.lightbox figure{margin:0;max-width:min(1200px,100%);max-height:100%;display:flex;flex-direction:column;align-items:center;gap:10px}.lightbox img{max-width:100%;max-height:calc(100vh - 130px);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);background:#fff}.lightbox figcaption{color:#e6e8ee;font-size:14px;text-align:center}.lb-close{position:absolute;top:14px;right:14px;width:46px;height:46px;border-radius:50%;border:0;background:#fff;color:#16181d;font-size:22px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)}.lb-close:focus-visible{outline:3px solid #7cc0ee;outline-offset:2px}'
LB_JS = "\n  var lb = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg'), lbCap = document.getElementById('lbCap'), lastFocus = null;\n  function openLb(b) { lastFocus = b; lbImg.src = b.dataset.full; lbImg.alt = b.querySelector('img').alt; lbCap.textContent = b.dataset.cap || ''; lb.hidden = false; document.body.style.overflow = 'hidden'; document.getElementById('lbClose').focus(); }\n  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }\n  document.querySelectorAll('button.shot-link').forEach(function (b) { b.addEventListener('click', function () { openLb(b); }); });\n  document.getElementById('lbClose').addEventListener('click', closeLb);\n  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });\n  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) closeLb(); });\n"


def main():
    s = (ROOT / "telecharger" / "index.html").read_text(encoding="utf-8")
    head = s[: s.index("<body>")]
    head = head.replace("Télécharger My UCA pour Android", "Télécharger l'extension My UCA pour Chrome")
    head = re.sub(r'<meta name="description"[^>]*>', '<meta name="description" content="Télécharge l\'extension Chrome / Edge My UCA en ZIP et ajoute-la en mode développeur : emploi du temps, notes et absences de l\'UCA. Gratuit, sans pub, sans données personnelles.">', head)
    head = head.replace('content="My UCA pour Android"', 'content="Extension My UCA pour Chrome (ZIP)"')
    head = head.replace("Emploi du temps, notes, lieux : l'app étudiante non officielle de l'UCA.", "Emploi du temps, notes, absences : l'extension étudiante non officielle de l'UCA.")
    head = head.replace("</style>", "code{background:rgba(127,127,127,.2);padding:1px 6px;border-radius:6px;font-size:.92em}.shot-link{display:block;margin-top:14px}.shot-link img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 0 0 1px var(--border),0 12px 28px -16px rgba(9,9,11,.4);transition:transform .25s}.shot-link:hover img{transform:scale(1.02)}.step{overflow:hidden}#installer .steps{grid-template-columns:1fr;gap:18px}#installer .step{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);column-gap:34px;row-gap:6px;align-items:start;padding:26px 30px 26px 78px}#installer .step::before{top:26px;left:26px;width:38px;height:38px;font-size:18px}#installer .step h3{grid-column:1/-1;font-size:21px;margin:2px 0 4px}#installer .step .st-body{grid-column:1;min-width:0}#installer .step .shot-link,#installer .step .st-art{grid-column:2;grid-row:2;margin-top:0;min-width:0}#installer .sub-steps{font-size:16px;line-height:1.55;padding-left:22px}#installer .sub-steps li{margin:9px 0}.st-art{display:grid;place-items:center;color:var(--accent);border-radius:16px;background:rgba(127,127,127,.07);padding:18px;box-shadow:0 0 0 1px var(--border)}.st-art svg{width:100%;max-width:340px;height:auto}.more{margin-top:10px;font-size:14.5px;color:var(--dim)}.more summary{cursor:pointer;color:var(--accent);font-weight:700;padding:6px 0;width:fit-content}.more p{margin:6px 0}@media(max-width:820px){#installer .step{grid-template-columns:1fr;padding:22px 20px 22px 66px}#installer .step .shot-link,#installer .step .st-art{grid-column:1;grid-row:auto;margin-top:8px}}.tuto-cta{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin:8px 0 24px;padding:24px 28px;border-radius:26px;text-decoration:none;color:var(--text);background:linear-gradient(120deg,rgba(5,104,166,.16),rgba(5,104,166,.04) 60%,transparent),var(--surface);box-shadow:0 0 0 1.5px var(--accent) inset,0 18px 40px -22px rgba(5,104,166,.55);position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}.tuto-cta:hover{transform:translateY(-3px);box-shadow:0 0 0 2px var(--accent) inset,0 26px 50px -22px rgba(5,104,166,.7)}.tuto-cta:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.tc-ico{width:70px;height:70px;border-radius:22px;background:var(--accent);color:var(--on);display:grid;place-items:center;flex:none;animation:tcFloat 3.2s ease-in-out infinite}.tc-ico svg{width:36px;height:36px}.tc-txt{display:grid;gap:3px;flex:1 1 260px;min-width:0}.tc-txt b{font-size:clamp(20px,2.6vw,26px);line-height:1.2;letter-spacing:-.01em}.tc-txt span{color:var(--dim);font-size:15.5px}.tuto-big{display:inline-flex;align-items:center;gap:12px;min-height:60px;padding:0 30px;border-radius:18px;background:var(--accent);color:var(--on);font-weight:800;font-size:18px;position:relative;overflow:hidden;animation:tcPulse 2.6s ease-out infinite}.tuto-big::after{content:'';position:absolute;top:0;bottom:0;width:60px;left:-80px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg);animation:tcShine 3.4s ease-in-out infinite}.tuto-big svg{width:22px;height:22px;transition:transform .2s;animation:tcNudge 1.6s ease-in-out infinite}.tuto-cta:hover .tuto-big svg{transform:translateX(5px)}@keyframes tcFloat{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}@keyframes tcPulse{0%{box-shadow:0 0 0 0 rgba(5,104,166,.5)}70%,100%{box-shadow:0 0 0 18px rgba(5,104,166,0)}}@keyframes tcShine{0%,55%{left:-80px}100%{left:130%}}@keyframes tcNudge{0%,100%{margin-left:0}50%{margin-left:6px}}@media(prefers-reduced-motion:reduce){.tc-ico,.tuto-big,.tuto-big::after,.tuto-big svg{animation:none}.tuto-cta{transition:none}}@media(max-width:620px){.tuto-big{width:100%;justify-content:center}}\n</style>")
    tail = s[s.index("<script>"):]
    tail = tail.replace('fetch("../version.json"', 'fetch("../manifest.json"')
    maj_js = """  var m = document.getElementById('maj');
  if (location.hash === '#maj' && m) { m.open = true; m.scrollIntoView(); }
  if (/[?&]auto=1/.test(location.search)) setTimeout(function () {
    /* Mise à jour demandée par l'extension : on télécharge seulement le script de mise à jour de ton système (pas le ZIP). */
    var ua = navigator.userAgent || '';
    var f = /Windows/i.test(ua) ? 'maj-extension.bat' : (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) ? 'maj-extension.command' : 'maj-extension.sh';
    var a = document.createElement('a'); a.href = f; a.download = f; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    if (m) { var n = document.createElement('p'); n.setAttribute('role', 'status'); n.style.cssText = 'margin:0 0 12px;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,.15);font-weight:600'; n.textContent = f + ' est téléchargé : ouvre-le, vérifie le dossier proposé puis clique sur « Valider ». L’extension sera mise à jour toute seule.'; m.insertBefore(n, m.children[1] || null); }
  }, 700);
"""
    maj_js += LB_JS
    tail = tail.replace("})();\n</script>", maj_js + "})();\n</script>", 1)
    head = head.replace("</style>", LB_CSS + "</style>", 1)
    OUT.mkdir(exist_ok=True)
    page = head + BODY.replace("@ZIP@", ZIP).replace("@DL@", DL) + tail
    (OUT / "index.html").write_text(page, encoding="utf-8")
    subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "tests" / "build_chrome.py")], check=True, stdout=subprocess.DEVNULL)
    import json
    ver = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    shutil.copyfile(ROOT / "dist" / f"uca-extension-chrome-{ver}.zip", OUT / ZIP)
    subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "tests" / "build_firefox.py")], check=True, stdout=subprocess.DEVNULL)
    shutil.copyfile(ROOT / "dist" / f"uca-extension-firefox-{ver}.zip", OUT / "uca-extension-firefox.zip")
    CRLF = chr(13) + chr(10)
    bat = CRLF.join((ROOT / "tests" / "maj-extension.bat.src").read_text(encoding="utf-8").splitlines()) + CRLF
    (OUT / "maj-extension.bat").write_bytes(bat.encode("utf-8"))
    sh = chr(10).join((ROOT / "tests" / "maj-extension.sh.src").read_text(encoding="utf-8").splitlines()) + chr(10)   # LF seulement
    for name in ("maj-extension.sh", "maj-extension.command"):
        (OUT / name).write_bytes(sh.encode("utf-8"))
    import zipfile
    with zipfile.ZipFile(OUT / ZIP, "a", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("maj-extension.bat", bat.encode("utf-8"))
        for name in ("maj-extension.sh", "maj-extension.command"):
            zi = zipfile.ZipInfo(name); zi.compress_type = zipfile.ZIP_DEFLATED; zi.external_attr = 0o755 << 16
            zf.writestr(zi, sh.encode("utf-8"))
        zf.writestr("nettoyer-dossier-extension.bat", (OUT / "nettoyer-dossier-extension.bat").read_bytes())
    # Signature du ZIP (mise à jour automatique : l'extension refuse tout paquet non signé par le projet).
    ks = ROOT / "app" / "webview-app" / "keystore" / "keystore.properties"
    sigf = OUT / (ZIP + ".sig")
    if ks.exists():
        j = str(ROOT / "tools" / "SignBundle.java")
        subprocess.run(["java", j, "sign-ext", str(OUT / ZIP), str(sigf), str(ks)], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["java", j, "verify-ext", str(OUT / ZIP), str(sigf), str(ks)], check=True, stdout=subprocess.DEVNULL)
    else:
        print("ATTENTION : keystore.properties introuvable, ZIP non signé : la mise à jour automatique de l'extension sera refusée.")
    mo = lambda f: f"{f.stat().st_size / 1048576:.1f}".replace(".", ",") + " Mo"
    z, a = OUT / ZIP, ROOT / "EdtUca.apk"
    sizes = {"zip": mo(z), "apk": mo(a), "both": f"{(z.stat().st_size + a.stat().st_size) / 1048576:.1f}".replace(".", ",") + " Mo"}
    for f in (OUT / "index.html", ROOT / "telecharger" / "index.html"):
        t = f.read_text(encoding="utf-8")
        t = re.sub(r'(data-sz="(zip|apk|both)">)[^<]*', lambda m: m.group(1) + sizes[m.group(2)], t)
        f.write_text(t, encoding="utf-8")
    print("ok", ver, (OUT / ZIP).stat().st_size // 1024, "Ko")


if __name__ == "__main__":
    main()
