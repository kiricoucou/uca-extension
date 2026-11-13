# Plan de reprise : captures du tutoriel d'installation (à confier à une autre IA)

Objectif : une page « Aide à l'installation » (`installation.html`) avec **3 tutoriels de 10 étapes minimum chacun**, chaque étape = une vraie capture
annotée + un titre + « Ce que tu fais » + « À quoi ça sert ». Les images vont dans `aide-install/img/`, les textes dans `aide-install/steps.json`.

> Règle n°1 de la session actuelle : **ne rien piloter sur l'écran ni la souris tant que l'utilisateur travaille.** Ce plan se prépare sans toucher à l'écran ;
> l'exécution se fait quand l'utilisateur donne le feu vert (ou sur une machine virtuelle / un second PC).

---

## 1. État des lieux (vérifié)

| Tutoriel | Étapes en dossier | Verdict | Ce qui manque ou est faux |
|---|---|---|---|
| **ZIP (Chrome)** | 14 images `zip-01..14` | **À refaire en un seul passage** | Images issues de plusieurs essais (cohérence non garantie). Manquent : bulle de téléchargement ouverte (zip-03 ne montre que l'icône), étapes 15 (menu « puzzle ») et 16 (icône dans la barre) jamais générées, dialogue « Extraire » mal cadré, chemin non masqué. |
| **Installateur .bat** | 12 images `inst-01..12` | **Inutilisables sauf inst-01** | Les recadrages ciblaient la **fenêtre console noire** (même titre « Installateur My UCA » que l'assistant) au lieu de l'assistant WinForms ; l'Explorateur n'est jamais passé au premier plan (inst-03 montre Chrome) ; boîtes « Ferme tes navigateurs » et « dernière étape » non captées proprement ; un assistant est resté ouvert d'un essai précédent. **Il manque donc ~10 vraies captures.** |
| **PWA téléphone** | 14 images `pwa-01..14` | Correct, avec limites | Captures réelles de l'application en émulation téléphone. Les étapes **4, 5, 6** (menu ⋮ de Chrome, fenêtre « Installer », écran d'accueil Android) sont des **illustrations** car aucun téléphone n'est branché. À remplacer par de vraies captures du téléphone de l'utilisateur (voir §5). |

## 2. Étapes à produire (liste cible, titres définitifs)

### A. ZIP (16 étapes) — vrai Chrome 157 (profil neuf) + vrai Explorateur Windows
1. Ouvre le site (`kiricoucou.github.io/uca-extension`) — cadre sur « Installer l'extension ».
2. Clique « Télécharger le ZIP » — cadre sur le bouton.
3. Le fichier se télécharge — **bulle de téléchargement ouverte** (cliquer l'icône ⬇ de la barre) montrant `uca-extension-chrome.zip` « OK ».
4. Retrouve le ZIP dans Téléchargements (Explorateur, fichier sélectionné, cadre sur la ligne).
5. Clique « Extraire tout » (survol du bouton de la barre d'outils).
6. Choisis où extraire (boîte « Extraire les dossiers compressés », chemin `C:\MyUCA\extension`, recadrée sur la boîte).
7. Vérifie le dossier extrait (cadre sur `manifest.json`).
8. Ouvre `chrome://extensions`.
9. Active « Mode développeur » (cadre sur l'interrupteur, **après** clic réel).
10. Repère « Charger l'extension non empaquetée ».
11. Fenêtre de choix du dossier (« Sélectionner le répertoire de l'extension ») ouverte sur `C:\MyUCA`.
12. Chemin saisi + « Sélectionner un dossier ».
13. La page de bienvenue (« Choisis ton design ») s'ouvre toute seule.
14. La carte « Emploi du temps UCA » dans la liste des extensions.
15. Menu « puzzle » : l'extension et sa punaise (Chrome l'épingle d'office si « Épingler les nouvelles extensions » est actif).
16. L'icône dans la barre d'outils, on ouvre l'agenda.

### B. Installateur Windows .bat (14 étapes) — le plus à refaire
1. Section « Installateurs automatiques » du site (cadre sur « Installateur Windows »). ✔ `inst-01` existe.
2. Le .bat se télécharge (bulle Chrome ouverte, avertissement « Conserver » si présent).
3. Le fichier dans l'Explorateur (ligne sélectionnée).
4. Avertissement de sécurité Windows (« Exécuter ») **si présent** — sinon numéroter sans.
5. Assistant, page 1 : dossier d'installation + dossier de téléchargement (cadres sur les deux champs) + version détectée.
6. Assistant, page 2 : navigateurs détectés, cases cochées, bouton « Installer ».
7. Progression : barre + journal (« Dernière version… », « Fichiers installés… »).
8. Boîte « Ferme correctement : Google Chrome… » (bouton OK).
9. Boîte « dernière étape » (Chrome 137+ : charger le dossier une fois) — bouton OK.
10. Assistant terminé (journal complet + « Fermer »).
11. Chrome s'ouvre sur `chrome://extensions` : active le mode développeur.
12. « Charger l'extension non empaquetée » + dossier `C:\MyUCA\installateur\chrome` (chemin collé par Ctrl+V).
13. Page de bienvenue de l'extension.
14. Page de remerciement `merci.html` (cadre sur « Bienvenue : premiers pas »).

### C. PWA téléphone (14 étapes) — réelles sauf 4-6
1-3 site / « Installer l'app » / guide ✔ · **4-6 à remplacer par de vraies captures du téléphone** · 7-14 app (import, 3 moyens d'import, accueil, agenda, études, lieux, compte, menu clair/sombre) ✔.

## 3. Méthode propre (ce qui a marché, ce qui a cassé)

**Principe** : captures **plein écran réelles** (l'utilisateur l'a autorisé), Chrome et Explorateur **maximisés**, puis rognage de la barre des tâches (84 px en bas) et annotation
(cadre rouge `#E53935` + pastille numérotée). Export WebP 1280 px de large. Code existant : `tools/tuto_lib.py`, `tools/gen_tuto.py`, `tools/gen_tuto_pwa.py`,
`tools/wincap.ps1` (capture/foreground), `tools/uia.ps1` (positions des boutons par UI Automation).

**Environnement de prise de vue** (pour ne rien exposer) :
- Tout se passe dans `C:\MyUCA\` (`Téléchargements`, `extension`, `installateur`) : **aucun nom d'utilisateur** dans les chemins visibles.
- Chrome : profil neuf `--user-data-dir=%TEMP%\udd-xxx`, préférences écrites avant lancement : dossier de téléchargement `C:\MyUCA\Téléchargements`,
  **`selectfile.last_directory = C:\MyUCA`** (sinon la fenêtre « choisir un dossier » s'ouvre dans les dossiers perso de l'utilisateur), `signin.allowed=false`.
- Page `chrome://extensions` : supprimer du DOM les cartes d'extensions tierces de la machine (McAfee, NordVPN…) avant chaque capture.
- Explorateur : flouter le volet de navigation (liste de dossiers perso) ; ne jamais montrer le volet « Accès rapide ».

**Pièges rencontrés — à ne pas refaire** :
1. Playwright connecté en CDP **détourne les téléchargements** : envoyer `Browser.setDownloadBehavior {behavior:"default"}` juste après la connexion.
2. La **console cmd** du .bat porte le même titre que l'assistant : filtrer par classe de fenêtre (ignorer `ConsoleWindowClass` / `CASCADIA_*`) **et** lancer PowerShell du .bat avec `-WindowStyle Hidden`.
3. Ne jamais laisser une fenêtre « toujours au-dessus » : l'Explorateur restait derrière Chrome. Prendre le premier plan avec la touche Alt + `BringWindowToTop` + `SetForegroundWindow`.
4. **Garde-fou obligatoire avant toute frappe ou tout clic** : vérifier que la fenêtre au premier plan a le titre attendu (`tuto_lib.guard()`), sinon abandonner. Un essai a failli taper dans une autre application.
5. Ne jamais lancer `Stop-Process` avec un filtre sur la ligne de commande qui contient le nom du script : cela tue aussi le shell de l'outil.
6. Chrome 157 refuse `--load-extension` : l'extension se charge **par l'interface** (mode développeur → « Charger l'extension non empaquetée »), la boîte de dossier se pilote en tapant le chemin puis Entrée, puis clic sur « Sélectionner un dossier » si elle reste ouverte.
7. Installateur : exécuter la **version locale** avec les crochets de test `MYUCA_NOLAUNCH=1` (aucun navigateur lancé), `MYUCA_NOKILL=1` (aucun navigateur fermé de force), `MYUCA_CFGDIR=<dossier temporaire>`. Refuser de lancer si le fichier ne contient pas ces crochets.
8. Les boîtes d'avertissement de Windows (SmartScreen) n'apparaissent que si le fichier garde la marque « téléchargé depuis Internet » ; ne pas inventer cette capture si elle n'apparaît pas.

**Ordre d'exécution recommandé** (un flux à la fois, jamais en parallèle sur l'écran) :
`python -I -X utf8 tools/gen_tuto.py zip` → `... installateur` → `python -I -X utf8 tools/gen_tuto_pwa.py` → `python -I -X utf8 tools/gen_tuto.py page`.
Entre deux flux : fermer les Chrome de test (`udd-*`), fermer les fenêtres Explorateur sur `MyUCA`, vérifier qu'aucun assistant ne reste ouvert.

## 4. Contrôle qualité (critères d'acceptation)

- ≥ 10 étapes par tutoriel, numérotées sans trou, **une image par étape**, aucune image dupliquée entre deux étapes.
- Sur chaque image : la zone à cliquer est entourée en rouge et numérotée ; rien d'autre que la fenêtre voulue (pas de barre des tâches, pas d'icônes perso, pas de nom d'utilisateur, pas de dossiers perso).
- Relecture visuelle de **chaque** image (planche-contact 3×N) avant publication ; refaire toute étape où un cadre est mal placé.
- Textes en français, ton « tu », deux phrases max par champ ; « À quoi ça sert » explique le bénéfice, pas la technique.
- `installation.html` : 3 onglets (ZIP, Installateur, Téléphone), lightbox avec fermeture ✕ au-dessus du menu (`z-index` > 900), lien depuis le menu hamburger, `sitemap.xml`, `pages-files.txt`.
- Tests à relancer : `tests/extension_page.py`, `tests/a11y.py`, `tests/installers.py`.
- Exclure du ZIP de l'extension : `aide-install/` et `installation.html` (déjà dans `tests/build_firefox.py`).

## 5. Ce que seul l'utilisateur peut fournir

- **PWA, étapes 4-6** : 3 captures d'écran du téléphone (menu ⋮ de Chrome avec « Installer l'application » ; fenêtre de confirmation ; icône « My UCA » sur l'écran d'accueil). À déposer dans `aide-install/phone/` ; la page remplacera alors les illustrations. Pensez à flouter notifications, nom d'opérateur et autres applications.
- **Feu vert pour piloter l'écran** (≈ 10 minutes sans toucher souris ni clavier), ou une VM Windows propre : c'est le plus sûr.
- Adresses PayPal / crypto pour `don.html` (sans rapport avec le tutoriel).

## 6. Consigne prête à copier pour l'autre IA

> Tu reprends la génération du tutoriel d'installation du dépôt `extension_uca` (Windows 11, Chrome 157, Python + Playwright + Pillow). Lis `aide-install/PLAN-CAPTURES.md`
> en entier. Ne pilote jamais l'écran sans le feu vert explicite de l'utilisateur. Refais d'abord le tutoriel **Installateur .bat** (14 étapes, §2B) en respectant les pièges du §3,
> puis le ZIP (§2A), puis régénère `installation.html`. Contrôle chaque image visuellement. Ne commite que `aide-install/`, `installation.html`, `tools/`, `site-nav.js`, `sitemap.xml`,
> `pages-files.txt` et `tests/build_firefox.py` ; jamais `git add -A` (d'autres sessions travaillent dans l'arbre).
