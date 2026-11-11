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

## 1.46.13 — app Android 1.4.12 : barème des évaluations, mise à jour plus claire, carnet

- **Barème des évaluations (extension, app Android, app web iPhone/Android)** : une évaluation dont l'intitulé contient « (sur 12.0) », « (sur 25) »… est ambiguë (la note affichée est-elle déjà ramenée sur 20 ?). Pour chacune, deux boutons demandent « Cette note est sur combien ? » : « sur 20 » ou « sur 12 ». Le choix recalcule la moyenne de la matière, de l'UE et la moyenne générale (note × 20 ÷ barème, avec le coefficient), évaluation par évaluation. Une flèche ⇄ à côté de « (sur 12) » permet de rebasculer à tout moment. Choix gardé sur l'appareil et partagé avec l'app web et l'APK par l'export.
- **Écran de mise à jour de l'APK** : la liste des nouveautés défile et couvre toutes les versions publiées depuis celle installée (pas seulement la dernière) ; les boutons restent visibles en bas ; plus aucun bandeau « session expirée » par-dessus (d'abord la mise à jour, ensuite la connexion) ; l'APK téléchargé est supprimé après l'installation (à la mise à jour, au lancement suivant, et si on annule plus de 10 minutes après). Les versions qui ne changent que les pages (comme celle-ci pour l'extension et l'app web) passent par le paquet signé, sans installer d'APK.
- **App web (PWA)** : fenêtre « Nouvelle version disponible » (nouveautés défilantes, bouton « Mettre à jour maintenant » qui vide le cache et recharge) quand une version est publiée pendant que l'app est ouverte ; au premier lancement après une mise à jour, « Mise à jour installée » avec tout ce qui a changé. Même source que l'APK : `version.json` (champ `history`).
- **Carnet** : la marge rouge du relevé ne passe plus sur les premières lettres (le texte commence après, avec un petit espace) ; « Moyenne générale » et la note tiennent sur une ligne (aussi dans les 3 autres designs).

## 1.46.12 — app Android 1.4.11 : « Mes déclarations » dans les absences de l'app

- **App Android, onglet Absences** : la liste « Mes déclarations » (dates et horaires, motif, date de dépôt, statut Justifiée / Refusée / En attente) s'affiche comme dans l'extension. L'app ne lisait que les compteurs ; elle lit maintenant aussi la liste des déclarations d'Odin (même lecture que l'extension). Si Odin ne la montre pas, rien n'est inventé : seuls les compteurs restent.

## 1.46.11 — app Android 1.4.10 : cloche « Activité », fini les rafales de notifications

- **Cloche « Activité » dans l'agenda** (les 4 designs, entrée « Activité » dans le menu du téléphone) : à chaque synchronisation, tout ce qui s'est passé est gardé 30 jours et relisible : cours ajouté, annulé, déplacé, salle ou enseignant changé, nouvelle note, seuil d'absences atteint. Pastille rouge avec le nombre de nouveautés, remise à zéro à l'ouverture ; un clic sur un changement ouvre le jour concerné ; « Tout effacer » vide le journal. Les changements sur des cours déjà passés restent lisibles, marqués « passé », mais ne comptent pas comme nouveaux.
- **Notifications** : quand tu cliques sur « Synchroniser », plus aucune notification système (tu regardes l'écran, tout est dans la cloche). La synchro automatique envoie une seule notification groupée, uniquement pour les cours à venir.
- **Mise à jour de l'APK** : `version.json` annonçait un minimum trop bas, donc une app en 1.4.8 ne proposait jamais la 1.4.9. Corrigé (et testé) : les anciennes versions sont invitées à installer le nouvel APK.
- Données : `uca_activity` et `uca_activity_seen` sont exportées/importées avec le reste (téléphone, partage) et effacées par « Réinitialiser ».

## 1.46.10 — app Android 1.4.9 : app web identique à l'app Android, plus aucune donnée inventée

- **App web installable (Android et iPhone)** : même structure que l'app Android, barre du bas Accueil / Études / Agenda / Lieux / Compte, sous-écrans Notifications, Préférences, Scolarité, Stage et emploi, Bibliothèques, Transports, mêmes couleurs (`app/shell.html`). Accueil : statut réel des services et raccourcis ; Études : prochains cours ; Lieux : carte (avec accord) et itinéraires Google Maps / Waze / OpenStreetMap (et Plans sur iPhone) ; Compte : photo de profil gardée sur l'appareil, groupes, préférences, effacement des données ; Notifications : changements d'emploi du temps et nouvelles notes.
- **App web sur ordinateur** : mise en page de bureau (barre latérale à gauche au lieu de la barre du bas, écrans en deux colonnes, carte et liste des lieux côte à côte, agenda en pleine largeur, choix d'itinéraire en fenêtre centrale). Sur téléphone, mêmes écrans que l'APK.
- **Menu du téléphone** : l'entrée « Liste » avait une icône sans texte ; libellé ajouté dans les 4 designs.
- **Sécurité** : politique de sécurité (CSP) sur la coque de l'app web ; nouveau test : données piégées (groupes, changements, notes, profil) affichées sans jamais exécuter de script.
- Limites d'un navigateur (pas de contournement possible) : pas de connexion directe au CAS ni à Odin (les données arrivent par « Importer mes données »), pas de synchro ni de notification quand l'app est fermée, pas de widget ni de calendrier du téléphone.
- **App Android, données inventées retirées** : l'Accueil affichait « ● Ouvert » écrit en dur, « 3 mails non lus », des horaires de BU et un taux d'affluence ; la Scolarité un faux numéro étudiant et un faux INE, un bouton « certificat téléchargé » qui ne téléchargeait rien ; Stage et emploi de fausses offres ; Livres un faux historique. Remplacés par le statut réel des services (vérifié à l'ouverture), le vrai nombre de notifications et des liens vers les sites officiels (ENT, Odin, BU, offres de l'université, 1jeune1solution).

## 1.46.9 — app Android 1.4.8 : vue Liste, vue Jour en blocs, emploi du temps de la classe fiable

- **Nouvelle vue « Liste »** (bouton 📋 Liste, les 4 designs) : un jour sous forme de liste ; sur téléphone, glisser à gauche ou à droite change de jour. Raccourci clavier `L`.
- **Vue « Jour » en blocs** : même rendu que la vue 3 jours (blocs sur la grille horaire) mais un seul jour sur toute la largeur, glisser pour changer de jour. Le réglage « Vue à l'ouverture » propose « Liste (jour) » et « Jour (blocs) » ; sur téléphone la vue automatique reste la liste.
- **Emploi du temps de la classe (app)** : si aucune classe n'est sélectionnée dans ADE, l'app le dit (« Choisis ta classe dans ADE ») et lit le lien d'export toute seule dès qu'elle est choisie ; la progression bleue « EN DIRECT » ne reste jamais bloquée (fermeture garantie en cas d'échec ou de retour).
- **Vues 3 et 5 jours de la classe** : un même cours donné à plusieurs groupes en même temps devient une seule carte (profs et salles réunis) ; les cours simultanés partagent les colonnes au plus juste ; colonnes à largeur minimale avec défilement horizontal et heures fixes à gauche.

## 1.46.8 — notifications sans cours passés, jours passés conservés, note du carnet

- **Rappels de cours** : après plusieurs heures ou jours sans ouvrir le navigateur, Chrome et Firefox déclenchent d'un coup toutes les alarmes manquées au démarrage ; l'extension affichait alors « Dans 1 min : … » pour des cours passés. Un rappel n'est maintenant affiché que si le cours n'a pas commencé et si l'alarme n'a pas plus de 5 minutes de retard.
- **Changements d'emploi du temps** : seuls les cours à venir sont notifiés. Rappels de la veille (devoirs et examens) : ignorés s'ils arrivent avec plus de 6 h de retard.
- **Emploi du temps de toute la classe (ADE, edt.uca.fr)** : le filtre « Emploi du temps personnel » (Filtres) est coché par défaut (ton emploi du temps d'Odin). Décoché, l'agenda montre toute la classe, tous les groupes, comme si tout était coché. L'adresse de l'export iCalendar d'ADE se découvre une fois, dans une petite fenêtre de connexion CAS comme pour Odin (ADE ouvre « Exporter » puis « Générer URL » tout seul, rien à retaper si tu viens de te connecter) ; elle ne contient aucun jeton et l'export se relit ensuite sans cookie, à chaque synchro. Ton groupe est retrouvé grâce aux intitulés d'Odin (même jour, mêmes heures, même nom), et les jours passés qu'Odin n'a jamais renvoyés sont reconstitués à partir de la classe. Nouvelle permission : `https://edt.uca.fr/*`. Extension et app Android (la découverte de l'adresse dans l'app n'a pas été essayée avec une vraie session).
- **Les jours passés restent consultables** : une synchro ne remplace plus que les cours d'aujourd'hui et à venir ; les jours passés gardent ce que les synchros précédentes ont enregistré (400 jours d'historique au plus), dans l'extension et dans l'app Android. Un jour passé qu'Odin renvoie encore mais qu'on n'avait jamais vu est ajouté.
- **Graphique des notes** : la moyenne de chaque matière tient sur une seule ligne ; le graphique s'élargit avec le nombre de matières (défilement dans son cadre) ; la moyenne de la classe apparaît en barres claires dans chaque matière, avec un trait transparent pour la moyenne générale de la classe ; les matières sous le graphique sont cliquables : le panneau descend jusqu'à la matière, une flèche animée la désigne.
- **Panneau Notes sur téléphone** : largeur de l'écran moins 40 px, hauteur de l'écran moins 120 px, grande croix de fermeture, défilement dans le panneau, tableau qui défile dans son cadre.
- **Devoirs, examens, notes de cours** : un clic ouvre l'agenda sur le cours concerné, désigné par une flèche animée (examens du panneau Notes aussi). Les notes écrites sur les cours sont listées dans « Devoirs et examens ».
- **Design carnet** : la note personnelle s'écrit maintenant sur les lignes du papier (même hauteur de ligne pour le texte et les lignes, le papier défile avec le texte).
- **Nouvelle note** : la notification après synchro existait déjà (réglage « Nouvelle note », activé par défaut) ; elle est vérifiée par les tests.

## 1.46.7 — app Android 1.4.7 : l'APK de mise à jour est supprimé après l'installation

- Quand tu télécharges l'APK complet depuis l'écran de mise à jour et que tu l'installes, l'app supprime ensuite le fichier téléchargé au premier démarrage de la nouvelle version : il ne reste plus 5 Mo inutiles sur le téléphone.
- Les cookies de connexion de l'app sont aussi écrits sur le disque quand l'app s'arrête.
- **Diagnostic de connexion** (Préférences) : montre l'état de la session, les noms des cookies présents pour les sites de l'UCA (jamais leurs valeurs) et le journal des derniers contrôles, avec un bouton Copier pour un signalement.
- Ce correctif ne force pas la mise à jour : les 1.4.6 continuent de fonctionner, l'APK est proposé quand tu veux.

## 1.46.6 — app Android 1.4.6 : consultation hors session, graphique des notes, carte, notifications

- **Session expirée** : l'app reste entièrement consultable avec les données déjà synchronisées. Un bandeau rouge en bas à gauche dit « Session expirée. Veuillez vous reconnecter. » ; un bouton « Se connecter » est dans le menu de l'agenda et dans Compte. La messagerie, elle, redemande la connexion. La vérification de session teste la vraie page d'Odin et attend deux contrôles concordants avant d'afficher le bandeau.
- **Notes** : un clic sur « Moyenne générale » ouvre le graphique de toutes les matières, avec le trait pointillé horizontal de la moyenne générale et, dessous, les notes de chaque matière (vert ≥ 14, jaune de 10 à 14, orange < 10). Le graphique d'une matière montre aussi le trait de la moyenne générale.
- **Carte** : zoom et déplacement au doigt, fond OpenStreetMap ou Google Maps (sans clé d'API ; Google peut déposer des cookies), « Ouvrir avec Google Maps / Waze / OpenStreetMap » pour chaque lieu. Positions revérifiées dans OpenStreetMap (certaines étaient décalées de 200 m à 1 km) ; les horaires et taux d'affluence inventés sont supprimés.
- **Notifications** : vraies notifications seulement (nouveau mail reçu, nouvelle note) ; réglage « Nouveau mail reçu » dans les Préférences ; les lignes écrites en dur sont retirées.
- **Compte** : nom, prénom, date de naissance, numéro, formation, groupe et adresse @etu.uca.fr lus dans Odin avec la session de l'app (« non détecté » sinon), lien « Voir mon profil étudiant ». Photo de profil locale.
- **Préférences** : textes périmés corrigés, bouton de test du blocage réservé aux versions de test.
- Aucun cookie ni identifiant n'est lu ou copié par l'app : elle utilise la session de sa WebView.

## 1.46.5 — app Android 1.4.5 : session CAS fiable, design dans les Préférences

- **Session expirée à tort** : l'app te demandait de te reconnecter dès que tu la quittais, alors que la session CAS dure plusieurs jours. Elle ne déclare maintenant la session expirée que si Odin renvoie vraiment le formulaire de connexion (champ mot de passe), jamais pour une simple page intermédiaire ou un réseau lent ; en cas de doute, elle ne verrouille pas. La resynchro utilise les cookies de connexion de la WebView de l'app, que le système garde sur le disque (écriture forcée quand l'app passe en arrière-plan). L'app ne lit ni ne copie ces cookies.
- **Design de l'application** : Préférences → « Design », appliqué à l'agenda et mémorisé, y compris quand tu le changes depuis le menu de l'agenda. Les autres écrans de l'app gardent leur thème sombre.
- Cette version change le code natif : elle s'installe avec le nouvel APK (proposé par l'écran de mise à jour de l'app).

## 1.46.4 — glisser pour changer de période, un seul emoji (mise à jour automatique 1.4.4)

- **Glisser le doigt** vers la gauche ou la droite change de période sur téléphone dans toutes les vues : jour, 3 jours, 5 jours, 6 jours, semaine et mois, dans les 4 designs. Un geste commencé dans une zone qui défile elle-même à l'horizontale n'est pas pris pour un changement.
- **Un seul emoji** devant les entrées du menu (le design en mettait un, le menu en ajoutait un deuxième).
- Pour l'app Android, c'est une mise à jour des pages (paquet signé 1.4.4) : elle s'installe seule, sans nouvel APK.
- Tests : glissement dans les 6 vues des 4 designs et absence de double emoji (`tests/android_sync.py`).

## 1.46.3 — app Android 1.4.3 : profil fiable, bonhomme cliquable, photo, contrôle des mises à jour

- **Profil** : l'app affichait parfois le nom ou l'adresse d'un enseignant, lus dans l'emploi du temps. Elle ne retient plus que « Bonjour/Bienvenue + nom » et une adresse `@etu.uca.fr`, et ne fabrique plus d'adresse à partir du nom. Les profils déjà enregistrés sont effacés une fois, puis relus à la prochaine synchro.
- **Petit bonhomme** en haut à droite : il ouvre Mon compte, depuis tous les écrans.
- **Photo de profil** : dans Mon compte, touche la photo pour en choisir une dans ta galerie. Elle est réduite et gardée uniquement sur le téléphone, et effacée à la déconnexion.
- **Contrôle régulier des mises à jour** : l'app interroge GitHub toutes les 15 minutes tant qu'elle est ouverte, et toutes les heures même fermée (réseau requis). Une mise à jour signée des pages s'installe seule ; un nouvel APK est proposé à l'ouverture.
- Cette version change le code natif : elle s'installe avec le nouvel APK (les 1.4.2 continuent de fonctionner).

## 1.46.2 — app Android 1.4.2 : mise à jour automatique

- **Mise à jour automatique** : au lancement de l'app (puis au plus toutes les 30 minutes), elle lit `version.json` sur GitHub et, si une nouvelle version de l'interface existe, la télécharge et l'installe seule, sans retélécharger l'APK. Un message l'annonce et l'agenda se recharge.
- **Sécurité** : le paquet `ota-bundle.zip` doit être signé (`ota-bundle.sig`) avec la clé de signature de l'APK, qui reste sur l'ordinateur. L'app vérifie la signature avec son propre certificat, refuse tout retour en arrière, tout fichier hors du dossier de l'app et tout type de fichier inattendu. Les adresses sont écrites en dur dans l'app. Un dépôt GitHub piraté ne peut donc pas faire exécuter du code.
- Un changement du code natif (nouvel APK) reste proposé par l'écran d'installation.
- Pour publier une mise à jour de l'interface : `python -I -X utf8 tests/build_ota.py`, puis commit et push. La première installation de la 1.4.2 se fait à la main ; les suivantes sont automatiques.

## 1.46.1 — app Android : emploi du temps et session expirée

- **Emploi du temps de l'app** : l'app Android envoyait le texte brut de la page Odin, mais personne ne le transformait en cours, donc l'agenda restait vide après la synchro. Il est maintenant lu (comme dans l'extension) dans les 4 designs.
- **Session expirée** : l'app se verrouille entièrement (onglets et sous-écrans) et demande une nouvelle connexion CAS. Elle vérifie aussi la session en silence au retour dans l'app (au plus toutes les 5 minutes) ; si le réseau ne répond pas, elle ne bloque jamais.
- Aucun identifiant ni cookie n'est lu ou conservé par l'app : la connexion se fait dans la page officielle.
- Test : `tests/android_sync.py`.

## 1.46.0 — bugs graves, sécurité et ménage

- **Plus de fausse synchro** : sans extension, le site envoie vers l'import au lieu d'annoncer un succès sans rien récupérer. Le bouton Importer est de retour.
- **Liens utiles** : ils ouvrent le site publié depuis l'extension (ils menaient à une erreur dans le paquet magasin) ; le lien vers une page Mozilla inexistante est retiré.
- **Blocs de cours** : plus aucun texte coupé dans les 4 designs ; vue Jour en grille pour bulletin et professionnel.
- **Page transports** : elle ne tourne plus en boucle.
- **Sécurité** : pages protégées par une politique de contenu, fichiers importés vérifiés, fichier reçu importé seulement après confirmation.
- **App Android 1.4.0** : mises à jour à chaud non signées retirées, carte embarquée, profil effacé à la déconnexion.
- **Ménage** : images inutilisées et de droits douteux, doublons et aperçu de démo retirés. Politique de confidentialité mise à jour.
- Tests : plus aucun contact avec les vrais serveurs de l'UCA.

## 1.45.3 — design carnet rétabli

- Le design carnet avait perdu ses post-it pastel (couleurs vives illisibles, texte pâle) : sa palette, ses réglages de grille et ses textes d'origine sont restaurés.
- Accessibilité : le libellé de période de la vue semaine est maintenant repéré par les lecteurs d'écran.

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

