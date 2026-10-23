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

