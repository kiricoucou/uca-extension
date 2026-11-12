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
        <img class="on" src="../telecharger/shots/agenda-anime.webp" alt="Agenda du jour">
        <img src="../telecharger/shots/home.webp" alt="Accueil avec le statut des services" loading="lazy">
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
      <div class="step"><h3>Télécharge et décompresse</h3><p>Clique sur « Télécharger le ZIP », puis clic droit sur le fichier → « Extraire tout ». Garde le dossier obtenu : Chrome le lit depuis là.</p></div>
      <div class="step"><h3>Mode développeur</h3><p>Dans Chrome, ouvre <code>chrome://extensions</code> (Edge : <code>edge://extensions</code>) et active « Mode développeur » en haut à droite.</p></div>
      <div class="step"><h3>Charge le dossier</h3><p>Clique « Charger l'extension non empaquetée » et choisis le dossier décompressé (celui qui contient <code>manifest.json</code>). Épingle l'icône, c'est prêt.</p></div>
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
      <div class="card"><div class="ic">🎨</div><h3>4 designs</h3><p>Anime, Professionnel, Bulletin ou Carnet : mêmes fonctions, ton style.</p></div>
    </div>
  </section>

  <section class="reveal">
    <h2>Questions</h2>
    <details><summary>Est-ce que le ZIP contient mes données ?</summary><p>Non. Le ZIP est généré depuis le code public : cours, notes et identifiants n'existent que dans le navigateur de chacun. Chaque personne démarre à vide et se connecte avec son propre compte UCA.</p></details>
    <details><summary>Et mon mot de passe ?</summary><p>Il est tapé sur la vraie page de connexion de l'UCA (CAS). L'extension ne le voit pas et ne l'enregistre pas.</p></details>
    <details><summary>Chrome affiche « Désactiver les extensions en mode développeur »</summary><p>Message normal pour toute extension chargée à la main : ferme-le sans désactiver. Ne déplace ni ne supprime le dossier décompressé, sinon l'extension disparaît.</p></details>
    <details id="maj"><summary>Comment mettre à jour ?</summary><p>Retélécharge le ZIP ici, remplace le contenu du dossier, puis clique sur « Recharger » dans <code>chrome://extensions</code>. L'extension te prévient quand une nouvelle version existe.</p></details>
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


def main():
    s = (ROOT / "telecharger" / "index.html").read_text(encoding="utf-8")
    head = s[: s.index("<body>")]
    head = head.replace("Télécharger My UCA pour Android", "Télécharger l'extension My UCA pour Chrome")
    head = re.sub(r'<meta name="description"[^>]*>', '<meta name="description" content="Télécharge l\'extension Chrome / Edge My UCA en ZIP et ajoute-la en mode développeur : emploi du temps, notes et absences de l\'UCA. Gratuit, sans pub, sans données personnelles.">', head)
    head = head.replace('content="My UCA pour Android"', 'content="Extension My UCA pour Chrome (ZIP)"')
    head = head.replace("Emploi du temps, notes, lieux : l'app étudiante non officielle de l'UCA.", "Emploi du temps, notes, absences : l'extension étudiante non officielle de l'UCA.")
    head = head.replace("</style>", "code{background:rgba(127,127,127,.2);padding:1px 6px;border-radius:6px;font-size:.92em}\n</style>")
    tail = s[s.index("<script>"):]
    tail = tail.replace('fetch("../version.json"', 'fetch("../manifest.json"')
    maj_js = """  var m = document.getElementById('maj');
  if (location.hash === '#maj' && m) { m.open = true; m.scrollIntoView(); }
  if (/[?&]auto=1/.test(location.search)) setTimeout(function () { var z = document.querySelector('#choix a[data-dl=zip]'); if (z) z.click(); }, 700);
"""
    tail = tail.replace("})();\n</script>", maj_js + "})();\n</script>", 1)
    OUT.mkdir(exist_ok=True)
    page = head + BODY.replace("@ZIP@", ZIP).replace("@DL@", DL) + tail
    (OUT / "index.html").write_text(page, encoding="utf-8")
    subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "tests" / "build_chrome.py")], check=True, stdout=subprocess.DEVNULL)
    import json
    ver = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["version"]
    shutil.copyfile(ROOT / "dist" / f"uca-extension-chrome-{ver}.zip", OUT / ZIP)
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
