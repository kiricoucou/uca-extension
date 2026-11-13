# Plan de reconstruction de TOUTES les captures du tutoriel d'installation

Remplace `PLAN-CAPTURES.md` (état des lieux) : ici, on **refait chaque image de zéro**, flux par flux, dans une seule session propre, avec le même
look, les mêmes règles de confidentialité et les mêmes textes. Hypothèse à confirmer : « PEA » = **APK** (application Android native) ; les quatre
méthodes sont donc : **ZIP**, **Installateur automatique**, **APK**, **PWA**.

> Interdit sans feu vert explicite de l'utilisateur : piloter l'écran, la souris ou le clavier du PC. Tout ce qui est « code / préparation » peut se
> faire avant ; les prises de vue se font ensuite, d'un bloc, sans que l'utilisateur travaille sur la machine (ou sur une VM / un second PC).

## 0. Inventaire cible (≥ 10 étapes par méthode, toutes en vraies captures)

| Flux | Préfixe | Étapes | Source de l'image | Appareil / outil |
|---|---|---|---|---|
| ZIP (Chrome) | `zip-NN` | 16 | Vrai Chrome 157 + vrai Explorateur Windows | PC Windows, `tools/gen_tuto.py zip` |
| Installateur Windows (.bat) | `inst-NN` | 14 | Vrai assistant WinForms + vrais dialogues | PC Windows, `tools/gen_tuto.py installateur` |
| Installateur Linux (.sh) | `lin-NN` | 10 | Vrai terminal + zenity/kdialog + Firefox/Chromium | VM Linux (Ubuntu), captures d'écran de la VM |
| Installateur macOS (.command) | `mac-NN` | 10 | Vrais dialogues osascript + Terminal + Chrome | Mac réel ou VM macOS (sinon : non publié, voir §7) |
| APK Android | `apk-NN` | 14 | Écran réel du Samsung via adb | Téléphone + `adb exec-out screencap` |
| PWA Android | `pwa-NN` | 14 | Écran réel du Samsung (Chrome Android) via adb | Téléphone + adb |
| PWA iPhone (optionnel) | `ios-NN` | 10 | Écran réel d'un iPhone (Safari) | iPhone ; à défaut, absent (pas d'illustration trompeuse) |

Les 14 `pwa-NN` actuelles sont des captures **émulées** (Chrome desktop en mode téléphone) + 3 illustrations : elles sont **toutes remplacées**
par de vraies captures du téléphone. Les 14 `inst-NN` et 14 `zip-NN` actuelles sont **toutes supprimées et refaites** (séries mélangées).

## 1. Conventions communes (à appliquer partout)

- **Fichiers** : `aide-install/img/<préfixe>-NN.webp`, 1280 px de large (PC) ou 900×1600 px de hauteur utile (téléphone, posé dans un cadre de téléphone 1280×900),
  WebP qualité 86. Numéros à 2 chiffres, sans trou. **Une image = une étape = une seule action** ; deux étapes ne partagent jamais la même image.
- **Annotation** (Pillow, `tuto_lib.annotate`) : cadre rouge `#E53935` 5 px à angles arrondis + halo 11 % ; pastille ronde numérotée blanche sur rouge, en haut à gauche du cadre ;
  flèche rouge si la cible est éloignée. Jamais plus de 3 repères par image. Rien d'autre (pas de flèches décoratives).
- **Texte de chaque étape** (`steps.json`) : `title` (≤ 60 car.), `what` = « Ce que tu fais » (≤ 2 phrases, impératif, « tu »), `why` = « À quoi ça sert » (≤ 2 phrases, bénéfice concret),
  `alt` = description de l'image pour lecteur d'écran (1 phrase). Tout en français.
- **Confidentialité (bloquant)** : aucun nom d'utilisateur Windows, e-mail, numéro étudiant, nom/prénom, numéro de téléphone, opérateur, IMEI, notifications perso, dossiers perso, onglets perso,
  applications épinglées. Voir §2 pour l'environnement qui l'empêche à la source, et §6 pour le contrôle.
- **Données** : démo uniquement (`seed()` de `tests/fixtures.py` ou `?demo=1`). Aucune connexion réelle à Odin/CAS : le tutoriel s'arrête avant la saisie des identifiants.
- **Cohérence visuelle** : même version de l'extension (`1.46.30`) et de l'app (`1.4.22`) partout ; Chrome en français, thème clair ; Windows en français, thème clair.

## 2. Environnement de prise de vue (à préparer une fois)

### PC Windows (ZIP + installateur Windows)
1. Résolution fixe : écran principal 2560×1600 @175 % (ou VM 1920×1080 @100 %) ; captures plein écran ; barre des tâches rognée (84 px en bas).
2. Dossiers : `C:\MyUCA\Téléchargements`, `C:\MyUCA\extension`, `C:\MyUCA\installateur`, `C:\MyUCA\Telechargements-installateur` (propres avant chaque flux).
3. Chrome : profil neuf `--user-data-dir=%TEMP%\udd-<flux>`, préférences pré-écrites : `download.default_directory=C:\MyUCA\Téléchargements`, `selectfile.last_directory=C:\MyUCA`,
   `signin.allowed=false`, pas de popup de bienvenue. Retirer du DOM de `chrome://extensions` les cartes d'extensions tierces de la machine avant chaque capture.
4. Explorateur : flouter le volet de navigation (zone `x<285`), jamais « Accès rapide ».
5. Aucune autre fenêtre visible : maximiser la fenêtre filmée, fermer/minimiser le reste ; mode « Ne pas déranger » Windows activé (pas de toasts).
6. Outils : `tools/wincap.ps1` (premier plan Alt+`BringWindowToTop`, plein écran), `tools/uia.ps1` (rectangles des boutons par UI Automation), `tools/tuto_lib.py` (garde-fou, annotation, Chrome piloté par CDP,
   `Browser.setDownloadBehavior default`), classes `ConsoleWindowClass`/`CASCADIA_*` ignorées, PowerShell du `.bat` lancé `-WindowStyle Hidden`.
7. **Garde-fou** (`guard()`) avant chaque frappe/clic : titre de la fenêtre au premier plan = attendu, sinon arrêt immédiat sans rien taper.

### Téléphone Android (APK + PWA Android)
1. Activer *Options pour les développeurs → Débogage USB* (ou *Débogage sans fil*), brancher, accepter l'empreinte RSA. Binaire : `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`
   (pour les outils REA : variable `REA_ADB_PATH` vers ce chemin). Vérifier : `adb devices -l` liste le téléphone.
2. Téléphone propre : *Ne pas déranger* ON, notifications masquées sur l'écran verrouillé, fond d'écran neutre, aucune autre appli sur l'écran d'accueil de test (créer un écran d'accueil vide),
   mode démo de la barre d'état : `adb shell settings put global sysui_demo_allowed 1` puis `adb shell am broadcast -a com.android.systemui.demo -e command enter`,
   `... -e command clock -e hhmm 0941`, `... -e command battery -e level 100 -e plugged false`, `... -e command network -e wifi show -e level 4`, `... -e command notifications -e visible false`
   (masque heure réelle, opérateur et notifications). Sortir du mode démo à la fin (`-e command exit`).
3. Capture : `adb exec-out screencap -p > raw.png` ; toucher : `adb shell input tap X Y` ; coordonnées exactes via `adb shell uiautomator dump /sdcard/u.xml` + `adb pull` (bounds du nœud par `text`/`resource-id`),
   jamais « à l'œil ». Attendre 800 ms après chaque action avant de capturer.
4. APK de test : `EdtUca.apk` 1.4.22 ; pour montrer l'écran de mise à jour (étape 14), installer d'abord la version précédente (`git show 3320c4c:EdtUca.apk` = 1.4.21).
5. Cadre : poser la capture dans un cadre de téléphone (`tools/gen_tuto_pwa.frame`) ; masquer toute zone perso restante par aplat flou.

### VM Linux (installateur .sh) / Mac (installateur .command)
VM Ubuntu 24.04 (VirtualBox/Hyper-V) avec zenity + Firefox + Chromium ; captures de la fenêtre de la VM par l'hyperviseur ou `gnome-screenshot`. Mac : voir §7.

## 3. Capture A — ZIP (16 étapes) — `zip-NN`
| NN | Titre | Capture | Annotation / action |
|---|---|---|---|
| 01 | Ouvre le site | Chrome sur `kiricoucou.github.io/uca-extension`, bouton « Installer l'extension » centré | 1 cadre |
| 02 | Clique « Télécharger le ZIP » | `/extension/`, bouton `#dlTop` | 1 cadre |
| 03 | Le fichier se télécharge | Bulle de téléchargement **ouverte** (clic sur ⬇) avec `uca-extension-chrome.zip` « OK » | cadre sur ⬇ |
| 04 | Retrouve le ZIP | Explorateur, `C:\MyUCA\Téléchargements`, ligne du ZIP sélectionnée | cadre sur la ligne |
| 05 | Clique « Extraire tout » | Barre d'outils, bouton survolé | cadre sur le bouton |
| 06 | Choisis où extraire | Boîte « Extraire les dossiers compressés », chemin `C:\MyUCA\extension`, recadrée sur la boîte | cadre sur le champ |
| 07 | Vérifie le dossier | Explorateur dans `C:\MyUCA\extension`, `manifest.json` visible | cadre sur `manifest.json` |
| 08 | Ouvre `chrome://extensions` | Chrome, barre d'adresse, page vide de nos extensions | cadre sur l'URL |
| 09 | Active le mode développeur | Interrupteur activé **après** clic réel | cadre sur l'interrupteur |
| 10 | Repère « Charger l'extension non empaquetée » | Barre des 3 boutons | cadre sur le 1er bouton |
| 11 | Choisis le dossier | Fenêtre « Sélectionner le répertoire de l'extension » ouverte sur `C:\MyUCA` | aucun (volet gauche flouté) |
| 12 | Valide | Chemin saisi, bouton « Sélectionner un dossier » | cadre sur le bouton |
| 13 | La bienvenue s'ouvre | Onglet « Choisis ton design » | aucun |
| 14 | L'extension est listée | Carte « Emploi du temps UCA » activée | cadre sur la carte |
| 15 | Menu « puzzle » | Menu ouvert, extension + punaise | 2 cadres |
| 16 | Ouvre ton agenda | Icône épinglée, popup de l'extension | cadre sur l'icône |

## 4. Capture B — Installateur Windows (14 étapes) — `inst-NN`
Exécuter la **copie locale** de `extension/installer-windows.bat` avec `MYUCA_NOLAUNCH=1 MYUCA_NOKILL=1 MYUCA_CFGDIR=%TEMP%\cfg`, `MYUCA_URL=https://kiricoucou.github.io/uca-extension`.
| NN | Titre | Capture |
|---|---|---|
| 01 | Trouve les installateurs | `/extension/#installateurs`, cadre sur « Installateur Windows » |
| 02 | Le .bat se télécharge | Bulle Chrome ouverte (et « Conserver » si Chrome avertit) |
| 03 | Double-clique le fichier | Explorateur, `installer-windows.bat` sélectionné |
| 04 | Autorise l'ouverture | Avertissement Windows **seulement s'il apparaît** (sinon étape supprimée et renumérotée) |
| 05 | Choisis les dossiers | Assistant page 1 (installation + téléchargement, version détectée), 2 cadres |
| 06 | Choisis les navigateurs | Assistant page 2 (cases cochées), cadre liste + « Installer » |
| 07 | Installation en cours | Page progression : barre + journal partiel |
| 08 | Ferme tes navigateurs | Boîte « Ferme correctement : … », cadre sur OK |
| 09 | Dernière étape | Boîte « dernière étape » (Chrome 137+), cadre sur OK |
| 10 | Installation terminée | Journal complet + « Fermer » |
| 11 | Chrome s'ouvre sur les extensions | `chrome://extensions`, mode développeur à activer |
| 12 | Charge le dossier | Bouton « Charger l'extension non empaquetée » |
| 13 | Colle le dossier | Fenêtre de choix du dossier, chemin `C:\MyUCA\installateur\chrome` saisi |
| 14 | Bienvenue + remerciement | Page de bienvenue de l'extension (puis `merci.html` en étape bonus 15 si ≥ 15) |

## 5. Capture C — APK Android (14 étapes) — `apk-NN` (vrai Samsung)
01 Ouvre `kiricoucou.github.io/uca-extension/telecharger/` sur le téléphone · 02 Appuie « Télécharger l'APK » · 03 Chrome demande de confirmer le téléchargement (« Conserver ») · 04 Notification « Téléchargement terminé »
(ouvrir le volet de notifications en mode démo propre) · 05 Ouvre le fichier `EdtUca.apk` · 06 Android demande d'autoriser « Installer des applications inconnues » (réglage de Chrome) · 07 Active l'autorisation puis retour ·
08 Écran « Voulez-vous installer cette application ? » → Installer · 09 « Application installée » → Ouvrir · 10 Premier lancement : choix du design / calendrier ouvert · 11 Connexion UCA (page CAS, **champs vides**) · 12 Accueil de l'app (données démo importées) ·
13 Agenda + Études (notes) · 14 **Mise à jour obligatoire** : écran bloquant, puis annulation de l'installateur → bouton « ↻ Relancer la demande d'installation » visible (nouvelle fonction 1.4.22).
Chaque étape : coordonnées par `uiautomator dump`, annotation sur le bouton réel, cadre téléphone.

## 6. Capture D — PWA (Android 14 étapes `pwa-NN`, iPhone 10 étapes `ios-NN` optionnel)
Android (Chrome, vrai téléphone) : 01 Site (accueil) · 02 « Installer l'app » · 03 Guide d'installation · 04 Menu ⋮ de Chrome · 05 « Installer l'application / Ajouter à l'écran d'accueil » · 06 Fenêtre de confirmation ·
07 Icône « My UCA » sur l'écran d'accueil · 08 Premier lancement (écran d'import, plein écran sans barre d'adresse) · 09 Les 3 moyens d'import (QR animé, fichier, lien) · 10 Import d'un fichier de démo ·
11 Accueil · 12 Agenda · 13 Études/notes · 14 Compte (session privée) + menu clair/sombre.
iPhone (Safari, vrai iPhone — sinon on ne publie pas cet onglet) : Partager → « Sur l'écran d'accueil » → Ajouter → icône → ouverture → import → agenda.

## 7. Limites honnêtes (à écrire telles quelles sur la page, pas de maquette trompeuse)
- Sans Mac réel, pas d'onglet « macOS » (ou bandeau « captures à venir ») ; pas d'illustration présentée comme une capture.
- Sans iPhone, pas d'onglet iPhone.
- Linux : captures de VM (bureau GNOME), signalées « Ubuntu 24.04 ».
- Une capture qui ne peut pas être obtenue pour de vrai est retirée et le texte renumérote ; on n'invente pas d'écran.

## 8. Ordre d'exécution
1. Préparer (§2), vérifier `adb devices`, vider `C:\MyUCA`, supprimer toutes les anciennes images `aide-install/img/*.webp` et `steps.json`.
2. **Installateur Windows** (priorité) → vérifier → **ZIP** → vérifier.
3. **APK** puis **PWA Android** sur le téléphone → vérifier.
4. Linux (VM), puis Mac/iPhone si matériel dispo.
5. Générer `installation.html` : onglets selon les flux présents, `python -I -X utf8 tools/gen_tuto.py page`.
6. Contrôle (§9), tests, commit, push.

## 9. Contrôle qualité (bloquant avant publication)
- Planche-contact par flux (3 colonnes) relue **image par image** : bonne fenêtre, bon moment, cadre exact, texte lisible à 100 %, rien de perso (zoomer sur : barre d'adresse, barre d'état, volet Explorateur, notifications, noms de fichiers).
- Test automatique : chaque étape de `steps.json` a son image existante, ≥ 10 étapes par flux, aucune image dupliquée (hash), taille ≤ 250 Ko, `alt` présent.
- `tests/a11y.py`, `tests/extension_page.py`, `tests/installers.py`, `tests/update_gate.py` verts ; `installation.html` ouverte à 390 px et 1280 px sans défilement horizontal, lightbox fermable (✕ au-dessus du menu, z-index > 900, Échap).
- Versions : `1.46.30` / `1.4.22` visibles ; si une nouvelle version sort, re-prendre uniquement les étapes où le numéro apparaît.

## 10. Livrables et Git
`aide-install/img/*.webp`, `aide-install/steps.json`, `installation.html`, `tools/*` modifiés, `site-nav.js`, `sitemap.xml`, `pages-files.txt`, `tests/build_firefox.py`. Commit ciblé (jamais `git add -A`), `git pull --rebase --autostash` puis `git push`.
