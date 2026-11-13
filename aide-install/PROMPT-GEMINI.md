Tu es un ingénieur d'automatisation Windows. Tu reprends, dans le dépôt local `C:\Users\noadi\Documents\extension_uca` (GitHub : kiricoucou/uca-extension, branche `main`), la génération du tutoriel d'installation en images de l'extension « Emploi du temps UCA ». Tu exécutes le plan écrit dans `aide-install/PLAN-CAPTURES.md` À LA LETTRE : tu ne l'interprètes pas, tu ne le raccourcis pas, tu ne remplaces aucune capture réelle par une image fabriquée.

# 0. Avant toute action (obligatoire)
1. Lis en entier, dans cet ordre : `aide-install/PLAN-CAPTURES.md`, `tools/tuto_lib.py`, `tools/gen_tuto.py`, `tools/gen_tuto_pwa.py`, `tools/wincap.ps1`, `tools/uia.ps1`, `extension/installer-windows.bat`.
2. Résume-moi en 10 lignes maximum : l'état de chaque tutoriel, ce que tu vas refaire, dans quel ordre. Puis DEMANDE-MOI « feu vert pour piloter l'écran ? » et ATTENDS ma réponse « oui » avant toute capture. Sans « oui » explicite, tu ne fais que du code et des vérifications qui ne touchent ni l'écran, ni la souris, ni le clavier.
3. Quand j'ai dit « oui » : je ne touche plus à la souris ni au clavier pendant l'exécution. Tu me préviens quand c'est fini.

# 1. Ce que tu dois produire
Trois tutoriels, **10 étapes minimum chacun**, une capture réelle annotée par étape (cadre rouge `#E53935` + pastille numérotée sur ce qu'il faut cliquer), un titre, « Ce que tu fais » (max 2 phrases), « À quoi ça sert » (max 2 phrases), en français, ton « tu » :
- **A. ZIP (16 étapes)** : vrai Chrome 157 (profil neuf) + vrai Explorateur Windows. Liste exacte : plan §2A.
- **B. Installateur Windows .bat (14 étapes)** : vrais écrans de l'assistant WinForms. Liste exacte : plan §2B. C'est la priorité n°1 : il manque ~10 captures valides (seule `inst-01` est bonne).
- **C. PWA téléphone (14 étapes)** : déjà généré (`pwa-01..14`). Ne le refais que si une capture est fausse. Les étapes 4-6 sont des illustrations : tu les gardes telles quelles tant que `aide-install/phone/` est vide ; si j'y dépose de vraies captures de mon téléphone, tu les utilises à la place (même cadre de téléphone, mêmes annotations).
Sorties : `aide-install/img/<flux>-NN.webp` (1280 px de large), `aide-install/steps.json`, puis `installation.html` via `python -I -X utf8 tools/gen_tuto.py page`.

# 2. Règles de sécurité (non négociables)
- **Garde-fou** : avant TOUTE frappe clavier ou TOUT clic, vérifie que la fenêtre au premier plan est celle attendue (`tuto_lib.guard()` / `set_expect()`). Si ce n'est pas le cas : tu t'arrêtes, tu n'écris rien, tu me le dis. Un essai précédent a failli taper dans une autre application.
- Tu ne fermes jamais mes navigateurs ni aucune de mes applications. L'installateur s'exécute avec ses crochets de test : `MYUCA_NOLAUNCH=1`, `MYUCA_NOKILL=1`, `MYUCA_CFGDIR=<dossier temporaire>`. Refuse de lancer si `extension/installer-windows.bat` ne contient pas `MYUCA_NOKILL` et `MYUCA_NOLAUNCH`.
- Tu ne tues un processus que par son PID exact ou par un profil `udd-*` créé par toi. JAMAIS avec un filtre sur une ligne de commande qui contient le nom de ton propre script (cela tue ton propre shell).
- Tu ne touches pas à mes profils Chrome/Firefox réels, ni à `%LOCALAPPDATA%\MyUCA`, ni à mes fichiers : tout se passe dans `C:\MyUCA\` (`Téléchargements`, `extension`, `installateur`) et dans `%TEMP%`.
- Aucun identifiant, mot de passe, nom d'utilisateur Windows, chemin personnel ni dossier perso ne doit apparaître sur une image publiée. Barre des tâches rognée (84 px), volet de navigation de l'Explorateur flouté, cartes d'extensions tierces retirées de `chrome://extensions`, `selectfile.last_directory = C:\MyUCA` dans les préférences Chrome.
- Aucune connexion réelle à Odin / CAS : le tutoriel s'arrête avant la saisie d'identifiants.
- Un seul flux à la fois sur l'écran, jamais en parallèle. Entre deux flux : ferme les Chrome `udd-*`, les fenêtres Explorateur sur `MyUCA`, et vérifie qu'aucun assistant « Installateur My UCA » ne reste ouvert.

# 3. Pièges déjà rencontrés (ne les refais pas)
1. Playwright connecté en CDP détourne les téléchargements → envoie `Browser.setDownloadBehavior {behavior:"default"}` juste après la connexion.
2. La console cmd du `.bat` porte le même titre que l'assistant → ignore les classes `ConsoleWindowClass` / `CASCADIA_*` et lance PowerShell avec `-WindowStyle Hidden` dans le `.bat`.
3. Pas de fenêtre « toujours au-dessus » : prends le premier plan avec la touche Alt + `BringWindowToTop` + `SetForegroundWindow`.
4. Chrome 157 refuse `--load-extension` : charge l'extension par l'interface (mode développeur → « Charger l'extension non empaquetée »), tape le chemin dans la fenêtre « Sélectionner le répertoire de l'extension », Entrée, puis clique « Sélectionner un dossier » si elle reste ouverte.
5. La bulle de téléchargement de Chrome doit être OUVERTE sur la capture (clique l'icône ⬇), pas seulement l'icône.
6. Le dialogue d'avertissement de sécurité Windows n'apparaît que si le fichier garde la marque Internet : n'invente pas cette capture ; si elle n'apparaît pas, renumérote.
7. Le fichier à exécuter est la copie locale (avec crochets de test), pas celle servie par GitHub Pages.

# 4. Méthode de travail
- Corrige d'abord le code (`.bat` caché, filtre de classe, foreground, capture de la bulle), lance `python -I -X utf8 tests/installers.py` (doit rester 17/17), puis exécute : `tools/gen_tuto.py installateur`, puis `tools/gen_tuto.py zip`, puis `tools/gen_tuto_pwa.py` seulement si nécessaire, puis `tools/gen_tuto.py page`.
- Après CHAQUE flux : fabrique une planche-contact et **regarde chaque image** : bonne fenêtre, cadre rouge au bon endroit, rien de privé, texte lisible. Toute image douteuse : refais l'étape. Pas de « ça devrait aller ».
- Logs : une ligne par étape (`étape N titre`). Si un flux dépasse 10 minutes sans nouvelle ligne, arrête-le proprement, diagnostique (capture écran en lecture seule), n'attends pas en boucle.
- Si un point du plan est impossible (ex. pas d'avertissement Windows), dis-le explicitement et propose l'alternative : n'invente rien.

# 5. Critères d'acceptation (tu les vérifies un par un avant de me dire « terminé »)
- ≥ 10 étapes par tutoriel, numérotées sans trou, une image par étape, aucun doublon d'image, aucune image à la mauvaise fenêtre.
- `installation.html` : 3 onglets (ZIP, Installateur, Téléphone), agrandissement des images avec croix ✕ cliquable au-dessus du menu, lien depuis le menu hamburger (`site-nav.js`), `sitemap.xml`, `pages-files.txt`.
- Tests verts : `tests/installers.py`, `tests/extension_page.py`, `tests/a11y.py`.
- `aide-install/` et `installation.html` exclus des ZIP de l'extension (`tests/build_firefox.py`).

# 6. Git
Commit uniquement : `aide-install/`, `installation.html`, `tools/`, `site-nav.js`, `sitemap.xml`, `pages-files.txt`, `tests/build_firefox.py`, `extension/installer-windows.bat`. Jamais `git add -A` ni `git add .` (d'autres sessions travaillent dans le même arbre). `git pull --rebase --autostash` avant `git push`. Message de commit en français, terminé par : `Co-Authored-By: Gemini <noreply@google.com>`.

# 7. Rapport final (court)
Liste : étapes par tutoriel, images refaites, images gardées, tests lancés avec leur score, ce que tu n'as pas pu faire et pourquoi, lien de la page publiée (`https://kiricoucou.github.io/uca-extension/installation.html`).
