# Système de mise à jour

L'extension vérifie au démarrage, puis toutes les 20 minutes, si `manifest.json` sur la branche `main` de [kiricoucou/uca-extension](https://github.com/kiricoucou/uca-extension) a un numéro de version supérieur à celui actuellement chargé. Si oui, un écran ou un bandeau de mise à jour apparaît (popup et agenda, quel que soit le design choisi) avec le numéro de version et un bouton **Mettre à jour**.

## Limite technique (lis ça avant de penser que c'est cassé)

Une extension Chrome chargée en **mode développeur** (`chrome://extensions` → *Charger l'extension non empaquetée*) ne peut pas se réécrire elle-même depuis du JavaScript. Aucune API Chrome ne permet à une extension de télécharger et d'installer son propre code — ce serait de l'exécution de code distant non vérifié, bloqué par design.

Donc concrètement :

- **Si le dossier chargé dans Chrome est bien ce dépôt git** (cas normal pour ce projet) : dès qu'un nouveau commit est poussé sur `main`, les fichiers sur le disque changent (ou changeront après un `git pull` si le dossier n'est pas modifié en direct). Le bouton **Mettre à jour** appelle `chrome.runtime.reload()`, qui recharge l'extension **depuis les fichiers déjà sur le disque**. Si ces fichiers sont à jour, ça applique vraiment la nouvelle version en quelques secondes.
- **S'il ne l'est pas** (fichiers locaux pas encore synchronisés avec GitHub) : le bouton recharge quand même, mais avec l'ancien code — il faut d'abord mettre à jour le dossier local (`git pull`, ou retélécharger le dépôt) avant de cliquer.
- Pour une vraie mise à jour 100% automatique et silencieuse (sans aucune manip locale), il faudrait publier l'extension sur le Chrome Web Store : Chrome gère alors le téléchargement et l'installation tout seul via son propre mécanisme (`update_url`), ce que ce dépôt ne fait pas.

## Ce qu'il reste à faire côté utilisateur

- Rien tant que le dossier chargé dans Chrome reste ce dépôt synchronisé (`git pull` de temps en temps, ou laisser Claude committer/pusher directement dedans comme c'est fait actuellement).
- Si l'extension est un jour distribuée à d'autres personnes (zip téléchargé ailleurs), elles devront retélécharger la nouvelle version manuellement quand l'écran de mise à jour apparaît — le lien "Voir les changements sur GitHub" les y aide.

# Historique des versions

## 1.40.0 — fiabilité (lot 1)

Déjà en place avant cette version (vérifié, non refait) : détection des pannes d'Odin pour notes et absences, page méconnaissable signalée dans les panneaux Notes/Absences, journal de diagnostic copiable (Paramètres → Diagnostic), pages Odin factices (`tests/pages/`), CI GitHub Actions.

Ajouté :
- **Bandeau « Données vieilles de X h »** dans l'extension (les 4 designs) quand la dernière synchro a plus de 24 h, avec un bouton **Resynchroniser** (même chemin que « Synchroniser »). L'app avait déjà son rappel (lien vers l'import).
- **Emploi du temps méconnaissable** : si Odin répond mais qu'aucun cours n'est reconnu alors que l'ancien emploi du temps en contient encore à venir, l'ancien est conservé (jamais écrasé par du vide), un message clair s'affiche et le problème est noté dans le journal. Une vraie semaine vide (rien à venir avant) reste acceptée.
- Accessibilité : liste des cours du téléphone atteignable au clavier, contraste des cours passés corrigé (a11y 20/20).
- Tests : `tests/lots.py` (bandeau dans les 4 designs, téléphone et ordinateur), `tests/scrape.py` étendu à l'emploi du temps.

## 1.41.0 — fonctions étudiant (lot 2)

Déjà en place (vérifié, non refait) : rappel avant chaque cours avec salle et enseignant (délai réglable), détection des changements d'emploi du temps (cours ajouté, annulé, déplacé, salle changée) avec notification, alerte d'absences réglable, simulateur d'objectif, évolution des notes, export .ics (avec rappels), prochain cours.

Ajouté :
- **Devoirs et examens** (bouton « Devoirs » après Notes dans les 4 designs, entrée du menu mobile) : liste de devoirs liée aux matières, avec date de rendu et compte à rebours, case à cocher, « Effacer les terminés » ; les examens de l'emploi du temps (Examen, DS, Partiel) y apparaissent tout seuls. Stockage local (`uca_tasks`), transmis dans les transferts chiffrés vers l'app, effacé par « Réinitialiser » (annulable).
- **Rappels la veille à 18 h** pour chaque devoir non terminé et chaque examen (réglage « Devoirs et examens la veille », extension).
- **Prochain cours / examen** : « Examen dans 3 h : … » quand c'est un examen, et « · Examen dans 2 jours » ajouté après le prochain cours (agenda et popup).
- **Pastille d'absences** sur le bouton Absences : orange à un pas du seuil réglé, rouge une fois atteint.
- **Objectifs de moyenne** (fenêtre Notes) : *projection du semestre* (moyenne générale selon la note obtenue sur tout le reste) et *matières à prioriser* (classées par effet possible sur la moyenne générale, avec la note à viser dans la matière).
- **Export .ics** : option « Ajouter mes devoirs à rendre » (événements journée entière, rappel la veille à 18 h).
- **App** : notification « prochain cours » épinglée (Paramètres, demande l'autorisation). Limite honnête : une page web ne peut pas se réveiller sans serveur de push, la notification se met à jour à chaque ouverture de l'app, retour au premier plan et chaque minute tant que l'app est ouverte, pas en continu.
- Pas de lien d'abonnement `.ics` automatique : il faudrait héberger l'emploi du temps sur un serveur, ce que le projet s'interdit ; le fichier reflète la dernière synchro, à réexporter après une synchro.
- Tests : `tests/lots.py` (devoirs dans les 4 designs, XSS, rappels, examen, absences, .ics), `tests/grades.py` (projection, priorités), `tests/pwa.py` (notification épinglée), a11y étendu à la fenêtre Devoirs.

## 1.42.0 — app / PWA (lot 3)

Déjà en place (vérifié, non refait) : manifeste installable avec icônes maskable et raccourcis, service worker « réseau d'abord » avec repli sur le cache, guide d'installation Android / iPhone au premier lancement, import par lien, QR ou fichier.

Ajouté :
- **Hors ligne complet** : l'installation met maintenant en cache tout ce que chaque design et chaque page référencent (scripts, styles, icônes SVG, polices, pages d'aide), pas seulement ce qui a déjà été ouvert. Test : on installe, on coupe le réseau sans rien ouvrir d'autre, puis les 4 designs, les réglages, l'aide et le guide s'ouvrent sans requête échouée. Cache passé en `uca-app-v5`.
- **Guide d'installation rappelable** : entrée « Installer l'app sur l'écran d'accueil » dans le menu mobile et le panneau Liens (tant que l'app est dans un navigateur) ; le guide s'affiche même si un design est déjà choisi (`?force=1`) ; conseils selon le navigateur (iPhone hors Safari : « ouvre la page dans Safari » ; Firefox Android : menu ⋮ → Installer).
- **Partage en image** (panneau Exporter, tous les designs) : image PNG du jour ou de la semaine dessinée localement (aucune requête, sans les notes personnelles), envoyée par la feuille de partage native quand le navigateur sait partager un fichier, sinon enregistrée.
- Design bulletin : il lui manquait ses icônes SVG (page d'aide cassée hors ligne comme en ligne), ajoutées en vert.
- Doc : `store/PUBLIER.md` explique ce qui dépend de la publication AMO pour la synchro directe sur Firefox Android, et ce qui reste à tester sur un vrai téléphone.

## 1.45.2 — écran de mise à jour de l'app qui ne se fermait pas

- L'écran « Nouvelle version détectée » revenait en boucle sur le site et l'app : la version locale était figée à 1.1.0, donc « Mettre à jour » rechargeait sans rien changer. La version appliquée est maintenant mémorisée, et le bouton « Plus tard » (ex-« Mode Test Démo ») repousse l'écran jusqu'à la prochaine version.
- Extension : l'écran n'y est plus chargé (corrigé en 1.45.1). Si tu le vois encore, recharge l'extension après un `git pull`.

## 1.45.1 — paquets des magasins allégés

- Les paquets Firefox et Chrome n'embarquent plus l'APK, le bundle de mise à jour à chaud, la carte des campus ni les GIF de l'app (73 Mo → 2,5 Mo).
- L'écran de mise à jour GitHub de l'app n'est plus chargé dans l'extension : il bloquait l'agenda et n'a pas sa place dans un paquet de magasin.

## 1.44.0 — Odin en maintenance

Quand Odin affiche sa page « Site en maintenance. Les équipes sont mobilisées pour procéder aux opérations de mise à jour dans les meilleurs délais. Merci de ne pas ouvrir de ticket au support. » (souvent en http, sans HTTPS), l'extension le reconnaît comme une maintenance et non comme une panne ordinaire.
- **Ancienne synchro conservée** : ni l'emploi du temps, ni les notes, ni les absences ne sont touchés, et aucune fenêtre de connexion CAS ne s'ouvre pour rien.
- **Message clair** : « Odin est en maintenance : ancien emploi du temps conservé » dans la ligne d'info de l'agenda (4 designs), et dans les panneaux Notes et Absences.
- **Page en http** : l'hôte `http://odin.iut.uca.fr/*` est ajouté aux permissions (même hôte, uniquement pour lire cette page de maintenance servie sans HTTPS).
- Accessibilité : chaque grille horaire a un nom propre selon le nombre de jours affichés (plus de repères en double pour les lecteurs d'écran).
- Tests : pages de maintenance (https et http) pour l'emploi du temps, les notes et les absences ; tests d'images partagées et de l'app mobile qui ne dépendent plus du jour de la semaine (ils échouaient le week-end).

## 1.43.0 — site vitrine (lot 4)

Déjà en place (vérifié, non refait) : accueil avec comparatif des quatre façons d'utiliser le projet, aide complète de plus de cinquante questions avec recherche, page de confidentialité, 404.

Ajouté :
- **Démo interactive** sur l'accueil : le vrai agenda des quatre designs, téléphone ou ordinateur, avec des données inventées (`core/demo.js`, calées sur la semaine en cours). Aucune requête hors du site, stockage de session à part (le stockage réel de l'app n'est jamais touché), « Synchroniser » simulé, aucune page de la démo ne peut sortir du cadre. Le cadre ne se charge que quand la section devient visible.
- **FAQ** de six questions sur l'accueil (avec données structurées FAQPage) ; l'aide complète reste la référence.
- **« Quoi de neuf »** généré depuis `UPDATES.md` : page `nouveautes.html` et trois dernières versions sur l'accueil (`python -I -X utf8 tests/gen_news.py`, `--check` en test et en CI). Aucun script côté visiteur.
- **Version anglaise** `/en/` de l'accueil (présentation, comparatif, FAQ, démo) avec `hreflang` ; l'aide, les nouveautés et les applications restent en français, ce qui est indiqué sur la page.
- **Référencement et partage** : `canonical`, balises Open Graph et Twitter, image de partage 1200×630 (`tests/gen_og.py`), `sitemap.xml`, `robots.txt`.
- **Captures à jour** (sélecteur de design, fiches des magasins avec la liste des devoirs) ; fiches AMO / Chrome et notes du relecteur mises à jour (4 designs, devoirs, partage en image, confidentialité des devoirs).
- Accessibilité du site : `tests/a11y.py` audite aussi l'accueil, la version anglaise, les nouveautés et l'aide (ordinateur et téléphone) : nom du lien de marque, en-tête de tableau, zone de défilement du comparatif atteignable au clavier (32/32).
- Tests : `tests/pwa.py` couvre la démo (4 designs, téléphone, hors-ligne de l'app intact, aucune requête externe), l'anglais, les métadonnées, les nouveautés et le sitemap.

