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
      <div class="card"><div class="ic">💻</div><h3>Extension (ZIP)</h3><p>Chrome, Edge, Brave, à ajouter en mode développeur.</p><p style="margin-top:14px"><a class="ghost" data-dl="zip" href="@ZIP@" download>Télécharger le ZIP · <span class="sz" data-sz="zip">?</span></a></p></div>
      <div class="card"><div class="ic">📱</div><h3>Application (APK)</h3><p>Android 7 ou plus récent, se connecte seule à Odin.</p><p style="margin-top:14px"><a class="ghost" data-dl="apk" href="https://github.com/kiricoucou/uca-extension/raw/main/EdtUca.apk" download>Télécharger l'APK · <span class="sz" data-sz="apk">?</span></a></p></div>
      <div class="card"><div class="ic">📦</div><h3>Les deux</h3><p>Le ZIP et l'APK l'un après l'autre (autorise les téléchargements multiples si le navigateur le demande).</p><p style="margin-top:14px"><a class="dl" id="dlBoth" href="#choix" style="padding:12px 20px;font-size:16px">Tout télécharger · <span class="sz" data-sz="both">?</span></a></p></div>
    </div>
  </section>

  <section class="reveal" id="installer">
    <h2>Ajouter l'extension en 2 minutes</h2>
    <p class="sub">Elle n'est pas (encore) sur le Chrome Web Store : on la charge à la main, une seule fois.</p>
    <div class="steps">
      <div class="step"><h3>Télécharge et décompresse</h3>
        <ol class="sub-steps">
          <li>Clique sur <b>« Télécharger le ZIP »</b> (en haut de cette page). Le fichier <code>uca-extension-chrome.zip</code> arrive dans ton dossier <b>Téléchargements</b>.</li>
          <li>Ouvre ce dossier, fais un <b>clic droit</b> sur le fichier → <b>« Extraire tout… »</b> → <b>« Extraire »</b> (Mac : double-clic).</li>
          <li>Tu obtiens un dossier, par exemple <code>uca-extension-chrome</code>, qui contient directement <code>manifest.json</code>. <b>Ne le supprime pas et ne le déplace plus</b> : Chrome le lit depuis cet endroit tant que l'extension est installée.</li>
        </ol></div>
      <div class="step"><h3>Active le mode développeur</h3>
        <ol class="sub-steps">
          <li>Ouvre un nouvel onglet, tape <code>chrome://extensions</code> (Edge : <code>edge://extensions</code>) puis <b>Entrée</b>.</li>
          <li>En haut à droite, active l'interrupteur <b>« Mode développeur »</b>.</li>
          <li>Une barre de trois boutons apparaît : <b>« Charger l'extension non empaquetée »</b>, « Empaqueter l'extension » et « Mettre à jour ». Tu vas utiliser le premier.</li>
        </ol>
        <button type="button" class="shot-link" data-full="tuto/etape-2-mode-developpeur.webp" data-cap="Étape 2 : « Mode développeur » activé en haut à droite, avec les trois boutons juste dessous"><img src="tuto/etape-2-mode-developpeur.webp" width="1024" height="610" loading="lazy" alt="Page chrome://extensions avec « Mode développeur » activé en haut à droite et le bouton « Charger l'extension non empaquetée »"><span class="zoom">🔍 Agrandir</span></button></div>
      <div class="step"><h3>Charge le dossier</h3>
        <ol class="sub-steps">
          <li>Clique sur <b>« Charger l'extension non empaquetée »</b>.</li>
          <li>Dans la fenêtre <b>« Sélectionner le répertoire de l'extension »</b>, ouvre <b>Téléchargements</b> et sélectionne le <b>dossier</b> décompressé (pas le fichier .zip).</li>
          <li>Clique sur <b>« Sélectionner un dossier »</b>. L'extension « Emploi du temps UCA » apparaît dans la liste.</li>
          <li>Clique sur l'icône puzzle de la barre d'outils, puis sur l'épingle à côté de l'extension pour l'avoir toujours sous la main.</li>
        </ol>
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
    <details id="maj"><summary>Comment mettre à jour ?</summary><p>Le plus simple : télécharge <a href="maj-extension.bat" download>maj-extension.bat</a> (sans droits administrateur), mets-le dans le dossier de l'extension et double-clique : il télécharge la dernière version, remplace les fichiers, puis il te reste à cliquer « Recharger » dans <code>chrome://extensions</code> (ou à attendre la vérification automatique). À la main : retélécharge le ZIP, remplace le contenu du dossier et recharge. L'extension te prévient quand une nouvelle version existe. Le script est ajouté dans le ZIP, à côté de <code>manifest.json</code>.</p></details>
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


LB_CSS = '.sub-steps{margin:8px 0 0;padding-left:20px;font-size:14.5px;color:var(--dim)}.sub-steps li{margin:6px 0}.sub-steps b{color:var(--text)}button.shot-link{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in;position:relative;margin-top:14px;text-align:left;font:inherit}.shot-link .zoom{position:absolute;right:10px;bottom:10px;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;background:rgba(22,24,29,.82);color:#fff}.lightbox{position:fixed;inset:0;z-index:100;background:rgba(10,12,16,.86);display:flex;align-items:center;justify-content:center;padding:56px 16px 24px}.lightbox[hidden]{display:none}.lightbox figure{margin:0;max-width:min(1200px,100%);max-height:100%;display:flex;flex-direction:column;align-items:center;gap:10px}.lightbox img{max-width:100%;max-height:calc(100vh - 130px);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6);background:#fff}.lightbox figcaption{color:#e6e8ee;font-size:14px;text-align:center}.lb-close{position:absolute;top:14px;right:14px;width:46px;height:46px;border-radius:50%;border:0;background:#fff;color:#16181d;font-size:22px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)}.lb-close:focus-visible{outline:3px solid #7cc0ee;outline-offset:2px}'
LB_JS = "\n  var lb = document.getElementById('lightbox'), lbImg = document.getElementById('lbImg'), lbCap = document.getElementById('lbCap'), lastFocus = null;\n  function openLb(b) { lastFocus = b; lbImg.src = b.dataset.full; lbImg.alt = b.querySelector('img').alt; lbCap.textContent = b.dataset.cap || ''; lb.hidden = false; document.body.style.overflow = 'hidden'; document.getElementById('lbClose').focus(); }\n  function closeLb() { lb.hidden = true; lbImg.removeAttribute('src'); document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }\n  document.querySelectorAll('button.shot-link').forEach(function (b) { b.addEventListener('click', function () { openLb(b); }); });\n  document.getElementById('lbClose').addEventListener('click', closeLb);\n  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });\n  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lb.hidden) closeLb(); });\n"


def main():
    s = (ROOT / "telecharger" / "index.html").read_text(encoding="utf-8")
    head = s[: s.index("<body>")]
    head = head.replace("Télécharger My UCA pour Android", "Télécharger l'extension My UCA pour Chrome")
    head = re.sub(r'<meta name="description"[^>]*>', '<meta name="description" content="Télécharge l\'extension Chrome / Edge My UCA en ZIP et ajoute-la en mode développeur : emploi du temps, notes et absences de l\'UCA. Gratuit, sans pub, sans données personnelles.">', head)
    head = head.replace('content="My UCA pour Android"', 'content="Extension My UCA pour Chrome (ZIP)"')
    head = head.replace("Emploi du temps, notes, lieux : l'app étudiante non officielle de l'UCA.", "Emploi du temps, notes, absences : l'extension étudiante non officielle de l'UCA.")
    head = head.replace("</style>", "code{background:rgba(127,127,127,.2);padding:1px 6px;border-radius:6px;font-size:.92em}.shot-link{display:block;margin-top:14px}.shot-link img{display:block;width:100%;height:auto;border-radius:12px;box-shadow:0 0 0 1px var(--border),0 12px 28px -16px rgba(9,9,11,.4);transition:transform .25s}.shot-link:hover img{transform:scale(1.02)}.step{overflow:hidden}\n</style>")
    tail = s[s.index("<script>"):]
    tail = tail.replace('fetch("../version.json"', 'fetch("../manifest.json"')
    maj_js = """  var m = document.getElementById('maj');
  if (location.hash === '#maj' && m) { m.open = true; m.scrollIntoView(); }
  if (/[?&]auto=1/.test(location.search)) setTimeout(function () { var z = document.querySelector('#choix a[data-dl=zip]'); if (z) z.click(); }, 700);
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
    import zipfile
    with zipfile.ZipFile(OUT / ZIP, "a", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("maj-extension.bat", bat.encode("utf-8"))
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
