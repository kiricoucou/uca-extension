# Emploi du temps UCA — extension Chrome (non officielle)

Extension Chrome/Edge (Manifest V3) qui récupère ton emploi du temps, tes absences et ton relevé de notes depuis Odin (IUT Clermont Auvergne) avec **ta propre session**, et les affiche dans un agenda dans la barre d'outils.

Non officielle, non affiliée à l'Université Clermont Auvergne. Aucune donnée n'est envoyée à un serveur tiers : tout reste stocké localement dans ton navigateur (`chrome.storage.local`).

**📥 Installer :** [l'extension (ordinateur, Chrome/Edge)](#tutoriel-dinstallation) · [l'app (téléphone)](https://kiricoucou.github.io/uca-extension/install.html)

Faite pour rendre l'emploi du temps plus simple à lire au quotidien, avec un affichage qui s'adapte à chaque étudiant : trois designs au choix, vue jour/semaine/mois, filtres, rappels, et tout ce qui est listé ci-dessous.

## Captures d'écran

| Animé | Professionnel | Carnet |
|---|---|---|
| ![Design animé](designs/anime/previews/1-semaine.jpg) | ![Design professionnel](designs/professionnel/previews/1-semaine.jpg) | ![Design carnet](designs/carnet/previews/1-semaine.jpg) |

| Relevé de notes | Vue mobile | Popup |
|---|---|---|
| ![Relevé de notes](designs/anime/previews/2-notes.jpg) | ![Vue mobile](designs/carnet/previews/4-mobile.jpg) | ![Popup](designs/professionnel/previews/3-popup.jpg) |

D'autres captures de chaque design (vue mois, détail d'un cours...) sont dans `designs/<id>/previews/` et défilent dans le sélecteur de design de l'extension.

## Fonctionnalités

- **Synchronisation** : connexion CAS (fenêtre dédiée, 15 min pour valider la double authentification) puis reconnexion silencieuse tant que la session Odin reste valide. Détection automatique de session expirée.
- **Emploi du temps** : vues Jour / 3 jours / 5 jours / 6 jours / Semaine / Mois, zoom réglable, grille horaire (la journée la plus longue tient à l'écran sans scroll à 100 %).
- **Absences** : déclarées, justifiées, non justifiées, avec motif présenté, journées non justifiées, et la liste de tes déclarations (période, motif, statut) — synchronisées en même temps que l'emploi du temps.
- **Relevé de notes** : tableau UE → matière → évaluation (Coeff / Note / Moy / Maxi / Mini), copié depuis Odin, avec **moyenne générale** pondérée par les coefficients. Les notes apparues depuis moins de 2 jours sont en orange, depuis moins de 4 jours en jaune (Odin ne datant pas les notes, l'extension retient le moment où elle voit chaque note pour la première fois).
- **Notes personnelles** : un champ texte par cours, signalé par un petit indicateur sur le cours.
- **Déconnexion** depuis le popup, avec la durée de validité restante de la session.
- **Liens rapides** Moodle et messagerie Zimbra.
- **Mise à jour** : vérification de la version sur GitHub (voir [`UPDATES.md`](UPDATES.md)).
- **Page d'aide intégrée** (`aide.html`, bouton ❓) qui explique chaque fonctionnalité.
- **Rappel avant chaque cours** (notification avec matière et salle, délai réglable).
- **Synchronisation automatique** en arrière-plan (toutes les 1 à 12 h) : uniquement la reconnexion silencieuse, aucune fenêtre ne s'ouvre ; si la session a expiré, l'icône affiche « ! ».
- **Changements d'emploi du temps** détectés à chaque synchro (cours ajouté, annulé, déplacé, changement de salle) : badge sur le cours pendant 7 jours, cours annulé affiché barré, notification.
- **Notification de nouvelle note**.
- **Filtres** : recherche (matière, prof, salle), type de cours (CM / TD / TP / Examen), matières masquées ; appliqués à toutes les vues et au popup.
- **Export .ics** (Google Agenda, Outlook, téléphone) : semaine affichée, 4 semaines ou tout, avec rappels intégrés.
- **Pastille sur l'icône** : « 25m » avant un cours proche, sinon l'heure du prochain cours du jour, ou le nombre de cours restants.
- **Paramètres** communs à tous les designs (`settings.html`) : vue à l'ouverture, masquer le week-end, rappels, synchro auto, pastille, alertes.
- **Statut des sites en direct** (Paramètres, `core/status.js`) : Odin, CAS, Moodle, Mail, site de l'extension et mises à jour, avec latence, historique et surveillance optionnelle en arrière-plan (notification panne / retour). Sondes anonymes, aucune donnée envoyée.
- **Outils de la fenêtre Notes** (`core/grades.js`) : prochains examens avec compte à rebours (cours « Examen », DS, Partiel), **simulateur d'objectif** (« quelle note sur les évaluations à venir pour avoir 10 en R1.01 / UE / moyenne générale ? », notes prises sur 20), graphiques d'**évolution** (courbe de la moyenne générale, enregistrée à chaque synchro où elle change ; barres note / moyenne de la classe par matière). **Alerte d'absences non justifiées** réglable (Paramètres), message dans le panneau Absences et notification.
- **Fiabilité de la lecture d'Odin** : page d'erreur d'Odin (404/500/503/maintenance) détectée aussi pour les notes et les absences, page méconnaissable signalée dans le panneau concerné (les anciennes données restent), **journal de diagnostic** local copiable (Paramètres → Diagnostic), sans aucun contenu de page.
- **Tests et CI** : `tests/scrape.py` (pages Odin factices dans `tests/pages/`), GitHub Actions (`.github/workflows/tests.yml`) lance toutes les suites à chaque push et produit les paquets Chrome/Firefox (`tests/build_chrome.py`, `tests/build_firefox.py`) ; un tag `vX.Y.Z` publie une version GitHub avec les deux zips.
- Responsive (menu hamburger sous 820px).
- **Trois designs au choix** : animé (sombre turquoise), professionnel (clair épuré), carnet (papier crème, écriture manuscrite, post-it).
- **Plusieurs designs au choix** : au premier lancement l'extension demande quel design utiliser (changeable ensuite). Les fonctionnalités sont identiques, seul l'affichage change.

## App téléphone (Android et iPhone)

Le site est servi par GitHub Pages : <https://kiricoucou.github.io/uca-extension/> — accueil avec comparatif (site / agenda en ligne / extension / app), [aide complète](https://kiricoucou.github.io/uca-extension/aide.html), page 404, et l'app installable (PWA). Un lien de partage (`#e=…`) ouvert sur la racine part directement à l'import.

- **Installation** : ouvre le lien sur ton téléphone. Android : bouton « Installer l'application ». iPhone (Safari) : Partager → « Sur l'écran d'accueil ». Icône, écran de démarrage et plein écran comme une vraie app ; fonctionne hors ligne.
- **Synchronisation directe** : si l'app est ouverte dans le **même navigateur** que l'extension (sur l'ordinateur), le bouton redevient **Synchroniser** et parle directement à Odin via l'extension (`content-bridge.js`) — comme dans l'extension elle-même, sans rien exporter ni importer. Sur un autre appareil (téléphone), ou si l'extension n'est pas installée, c'est impossible : un navigateur isolé une page web des cookies d'un autre domaine, et le CAS fait une double authentification dans une fenêtre dédiée. Les données passent alors par l'extension, trois façons au choix dans **Exporter** (sur l'ordinateur) :
  - **Générer le lien** (popup) ou **Copier un lien** (Exporter) — colle-le dans un SMS, un mail ou n'importe quelle appli, et ouvre-le sur ton téléphone. Les données voyagent **chiffrées** dans le lien lui-même (AES-GCM 256, clé dérivée par PBKDF2 du **code de partage** réglé dans Paramètres, jamais inclus dans un lien ni un export), après le `#` : jamais transmises dans une requête HTTP, ni GitHub Pages ni aucun serveur ne les voit ni ne les garde. La **durée de validité** (1 h à 7 jours, Paramètres) est authentifiée par le chiffrement : l'app refuse un lien expiré ou modifié. Le code est demandé une fois sur le téléphone (mémorisable). Dans l'app, **Importer → Coller un lien de partage** fait pareil en collant le texte à la main.
  - **QR code animé** — pratique à la première installation : dans l'app, **Importer → Scanner**.
  - **Fichier `.ucasync`** en secours (Drive, AirDrop, ou « Partager → EDT UCA » sur Android).
- Les trois designs, les filtres, les notes, les absences et l'export `.ics` fonctionnent dans l'app. Les rappels passent par l'export `.ics` (avec alarmes) importé dans le calendrier du téléphone.
- Refais un transfert après chaque synchro sur l'ordinateur pour mettre l'app à jour.
- **Mise à jour de l'app** (installée sur ordinateur ou téléphone, raccourci, onglet : même service worker) : tout est servi **réseau d'abord** (`sw.js`), le cache ne sert qu'hors ligne — en ligne, la dernière version s'affiche sans rien faire. Si la page a démarré sur sa copie hors ligne alors qu'une version plus récente est publiée, un écran plein écran avec un seul bouton **Mettre à jour** vide le cache et recharge.

## Tutoriel d'installation

Pas de Chrome Web Store (extension non publiée) : l'installation se fait « en mode développeur », en quelques clics.

### Chrome / Edge

1. **Télécharge le dépôt** : bouton vert **Code** sur cette page → **Download ZIP**, puis décompresse le dossier obtenu (ou clone-le avec `git clone` si tu connais git).
2. Ouvre un nouvel onglet et tape `chrome://extensions` dans la barre d'adresse (sur Edge : `edge://extensions`).
3. En haut à droite, active **Mode développeur**.
4. Clique **Charger l'extension non empaquetée**, puis sélectionne le dossier décompressé (celui qui contient `manifest.json`).
5. L'icône de l'extension apparaît dans la barre d'outils (épingle-la pour la garder visible). Un onglet s'ouvre automatiquement pour **choisir un design** (animé, professionnel ou carnet) — rien n'empêche d'en changer plus tard avec le bouton **Design**.
6. Clique l'icône de l'extension → **Se connecter**. Une fenêtre CAS UCA s'ouvre : connecte-toi normalement (identifiant, mot de passe, double authentification). L'emploi du temps se charge automatiquement une fois connecté.

### Firefox

Manifest V3 dédié (`manifest.firefox.json`, `browser_specific_settings.gecko` déclaré) : fond
persistant par scripts (`background.scripts`, pas de service worker, Firefox ne le gère pas de la
même façon que Chrome) au lieu de `background.service_worker`, sinon même code, mêmes permissions,
mêmes `content_scripts` que la version Chrome — vérifié identiques par `tests/parity.py`.

1. `python -I -X utf8 tests/build_firefox.py` — construit le paquet dans `dist/firefox/`
   (`manifest.firefox.json` renommé en `manifest.json`, fichiers de dev comme `tests/` ou `app/`
   exclus) et un `.zip` prêt à déposer dans `dist/`.
2. `about:debugging#/runtime/this-firefox` → **Ce Firefox** → **Charger un module complémentaire
   temporaire** → `manifest.json` du dossier `dist/firefox/` (ou n'importe quel fichier dedans).

Avec Firefox, un module temporaire est retiré à chaque fermeture du navigateur : il faut refaire
l'étape 2 à chaque redémarrage (le build de l'étape 1 n'est à refaire qu'après un changement de
code). Pour une installation permanente, qui survit aux redémarrages et ouvre la voie à Firefox
Android, déposer le `.zip` de l'étape 1 sur
[addons.mozilla.org](https://addons.mozilla.org/developers/addon/submit/) (pas encore fait).

### Sur ton téléphone

Pas besoin d'installer l'extension : voir la section [App téléphone](#app-téléphone-android-et-iphone) ci-dessus, qui fonctionne comme une vraie app une fois les données transférées depuis l'extension.

## Structure

Une seule extension (la racine du dépôt). La logique est commune ; chaque dossier de `designs/` ne contient que l'affichage.

| Fichier | Rôle |
|---|---|
| `manifest.json` | Manifest unique (popup par défaut : `choose.html`) |
| `background.js` | Service worker : connexion CAS, scraping, synchro, déconnexion, mise à jour GitHub, application du design choisi (`chrome.action.setPopup` / `setIcon`) |
| `choose.html` / `choose.js` | Sélecteur de design (premier lancement, puis bouton « Design ») |
| `core/grades.js`, `tests/grades.py` | Calculs de notes (moyennes, simulateur, historique) et leurs tests |
| `tests/scrape.py`, `tests/pages/` | Parseurs et pannes d'Odin sur des pages factices |
| `core/status.js` | Sondes de statut des sites (widget Paramètres + surveillance du service worker) |
| `settings.html` / `settings.js`, `core/settings.js` | Page Paramètres et valeurs par défaut des réglages (partagées avec le service worker) |
| `core/shared.js` | API de design (`UCA_defineDesign`) + briques communes (mise à jour, changement de design) |
| `core/tools.js` | Filtres et export .ics |
| `core/popup.js` / `core/agenda.js` | Logique du popup et de l'agenda, identique pour tous les designs |
| `designs/designs.json` | Registre des designs disponibles |
| `designs/<id>/` | Un design : `popup.html`, `agenda.html`, `aide.html`, `confidentialite.html`, `design.js`, `icons/`, assets |
| `core/env.js` | Dans l'app téléphone, remplace les API de l'extension (stockage, messages) ; ne fait rien dans l'extension |
| `core/transfer.js` | Transfert vers l'app (QR animé, fichier `.ucasync`) |
| `app/`, `app.webmanifest`, `sw.js` | App téléphone : accueil, import, guide d'installation, icônes, écrans de démarrage, hors ligne |
| `vendor/` | Générateur et lecteur de QR codes (licences dans `vendor/README.md`) |
| `content-bridge.js` | Relais de messages vers le site web (localhost/file) |

### Ajouter un design

1. Copier un dossier existant de `designs/` sous un nouveau nom et modifier ses HTML/CSS/assets (garder les `id` des éléments utilisés par le core).
2. Adapter son `design.js` : `UCA_defineDesign({...})` ne définit que ce qui change (icônes, textes, couleurs des cours, variantes d'affichage) ; tout le reste prend les valeurs par défaut de `core/shared.js`.
3. Ajouter une entrée dans `designs/designs.json` (`id`, `name`, `description`, `folder`, `preview`, `screenshots`). Les captures (`previews/` du dossier du design) défilent dans le sélecteur.

Le sélecteur et le service worker lisent le registre : aucun autre fichier à toucher.

## Tests

Prérequis : Python 3 + Playwright (`pip install playwright` puis `playwright install chromium`).

| Commande | Rôle |
|---|---|
| `python -I -X utf8 tests/check_design.py` | Chaque design du registre fournit tous les éléments utilisés par le core et ses captures |
| `python -I -X utf8 tests/e2e.py [dossier]` | Charge l'extension dans Chromium avec des données factices et vérifie chaque design : pas de scroll, aucun bloc coupé, barre sur 2 étages dans le même ordre, moyenne, notes récentes, réglages, vue téléphone, 0 erreur JS (captures dans `dossier` si fourni) |
| `python -I -X utf8 tests/gen_icons.py <id>` | Rend `designs/<id>/icons/icon.svg` en PNG 16/32/48/128 |
| `python -I -X utf8 tests/pwa.py [dossier]` | Teste l'app téléphone servie en local (Android via Chromium, iPhone via WebKit) : installation, choix du design, import, hors ligne, raccourcis, aller-retour des QR codes |
| `python -I -X utf8 tests/bridge.py` | Teste le pont extension ↔ app web (`content-bridge.js` + `core/env.js`) : détection de l'extension, bouton Synchroniser, résultat de synchro appliqué sans recharger |
| `python -I -X utf8 tests/parity.py` | Vérifie que `manifest.json` et `manifest.firefox.json` restent en phase (permissions, host_permissions, content_scripts) |
| `python -I -X utf8 tests/build_firefox.py` | Construit le paquet Firefox dans `dist/firefox/` + un `.zip` (voir section Firefox ci-dessus) |
| `python -I -X utf8 tests/gen_app_assets.py` | Régénère icônes et écrans de démarrage de l'app depuis `app/icons/icon.svg` |
| `python -I -X utf8 tests/gen_previews.py [id ...]` | Régénère les 6 captures du sélecteur (`designs/<id>/previews/`) |

## Confidentialité

Voir `confidentialite.html` dans le dossier de chaque design : l'extension utilise uniquement ta session existante sur `odin.iut.uca.fr` et `ent.uca.fr`, ne transmet rien à un tiers, tout reste local.

## Licence

Projet personnel, non affilié à l'UCA, fait pour rendre l'emploi du temps plus facile à lire au quotidien et pour s'adapter à chaque étudiant (choix du design, filtres, rappels...).

- **Partage** : je suis seul autorisé à partager, publier ou redistribuer ce code (dépôt, copie, build, lien de téléchargement...). Demande-moi avant de le publier ailleurs.
- **Modifications** : tu peux modifier ton exemplaire pour ton usage personnel, mais à tes propres risques — si une modification casse l'extension, affiche des données fausses, ou pose un problème quelconque, c'est de ta responsabilité, pas de la mienne.
- **Aucune garantie** : le projet est fourni tel quel, sans garantie de fonctionnement, de disponibilité ni d'exactitude des données affichées. L'UCA peut modifier Odin à tout moment et casser la récupération des données.

## Polices du design carnet

Caveat et Nunito, sous licence SIL Open Font License 1.1 (`designs/carnet/fonts/OFL-*.txt`), intégrées localement : aucune requête vers un service tiers.
