# Publier l'extension — guide pas à pas

Tout est prêt : paquets, textes, captures, notes pour le relecteur. Il ne reste que **tes** actions sur les sites
des magasins (compte, formulaire, bouton « Soumettre »), que je ne peux ni ne dois faire à ta place.

Version préparée : **1.43.0** · Extension : « Emploi du temps UCA (non officiel) »

## 0. Avant tout : pousser le code

La page de confidentialité publique doit être en ligne **avant** de soumettre (les magasins la demandent) :

```
git pull            # si tu as travaillé ailleurs
git push origin main
```

Attends 1 à 2 minutes puis vérifie que ceci s'ouvre :
<https://kiricoucou.github.io/uca-extension/confidentialite.html>

## 1. Fabriquer les paquets

```
python -I -X utf8 tests/build_firefox.py --store      # -> dist/uca-extension-firefox-store-1.43.0.zip
python -I -X utf8 tests/build_chrome.py --store       # -> dist/uca-extension-chrome-store-1.43.0.zip
python -I -X utf8 tests/gen_store.py                  # -> store/screenshots/*.png (1280x800, à refaire si le visuel change)
```

Ces paquets « magasin » diffèrent du paquet de développement : pas de vérificateur de mise à jour GitHub (le
magasin met à jour tout seul), pas d'accès à `raw.githubusercontent.com`, pont limité au site publié
(`kiricoucou.github.io`), aucun fichier de test. Ne publie **jamais** le paquet sans `--store`.

## 2. Firefox (addons.mozilla.org), le plus important : c'est lui qui donne la synchro sur Firefox Android

1. Crée / ouvre ton compte sur <https://addons.mozilla.org> (compte Firefox gratuit).
2. Ouvre <https://addons.mozilla.org/developers/addon/submit/distribution> et choisis **« Sur ce site »**
   (liste publique, mises à jour automatiques). « Par moi-même » donnerait un fichier signé non listé.
3. Envoie `dist/uca-extension-firefox-store-1.43.0.zip`. Le contrôle automatique doit passer sans erreur
   (des avertissements sont normaux, voir `NOTES-RELECTEUR.md`). Coche **Firefox pour ordinateur et Firefox pour Android**.
4. « Dois-tu soumettre le code source ? » → **Non** : le code n'est ni minifié ni généré (voir les notes).
5. Remplis la fiche en copiant `store/FICHE-FIREFOX.md` (nom, résumé, description, catégories, adresses, licence).
6. Captures : `store/screenshots/` (légendes dans la fiche).
7. **Notes pour le relecteur** : colle `store/NOTES-RELECTEUR.md` (un relecteur n'a pas de compte UCA : la méthode
   de test avec de fausses données y est).
8. Soumets. Compte quelques heures à quelques jours pour la relecture.

Ensuite, pour Firefox Android : ouvre la page AMO de l'extension depuis Firefox pour Android (version 142 ou plus)
et installe-la. Tes données restent locales au téléphone ; la synchro Odin passe par un onglet de connexion normal
(pas de fenêtre séparée sur Android) ; les notifications système n'existent pas sur Android (les réglages
concernés sont masqués).

## 3. Chrome Web Store (facultatif)

1. Compte développeur : <https://chrome.google.com/webstore/devconsole> (frais uniques de 5 USD).
2. « Nouvel élément » → envoie `dist/uca-extension-chrome-store-1.43.0.zip`.
3. Fiche : `store/FICHE-CHROME.md` (textes, justification de chaque permission, déclaration d'usage des données).
4. Captures 1280×800 : `store/screenshots/` (5 maximum pour Chrome).
5. Soumets pour examen.

## 4. Mettre à jour plus tard

1. Je fais les changements et j'incrémente la version (les deux `manifest*.json`) comme d'habitude.
2. Tu refais les commandes du point 1 puis, sur AMO : *Gérer mes modules → l'extension → Versions → Envoyer une
   nouvelle version* (même chose sur le Chrome Web Store : *Package → Importer une nouvelle version*).
3. Les utilisateurs reçoivent la mise à jour automatiquement après la relecture. Un numéro de version ne peut
   jamais être réutilisé.

## 5. Choses à savoir

- **Identifiant Firefox** : `uca-connecteur@site-emploi-du-temps.local` (dans `manifest.firefox.json`). Il ne peut plus
  changer une fois l'extension créée sur AMO.
- **Licence** : la fiche AMO te demande une licence. Ton README dit que tu es seul autorisé à redistribuer le code :
  choisis **« Tous droits réservés » (All Rights Reserved)**. Garde en tête que le code d'une extension publiée est
  téléchargeable par tout le monde (c'est le cas de toute extension).
- **Nom** : « (non officiel) » reste dans le nom et la description pour éviter toute confusion avec l'UCA. Si un
  relecteur objecte, la formulation de repli est « Agenda pour Odin (non officiel) ».
- **Données** : tout reste sur l'appareil ; la déclaration « aucune donnée collectée » est déjà dans le manifeste
  Firefox (`data_collection_permissions: none`) et dans la fiche Chrome.
- **Vérification de version GitHub** : retirée des paquets magasin ; le paquet de développement (dossier du dépôt,
  `git pull`) la garde.
- **Ce que je n'ai pas pu tester** : l'installation réelle sur Firefox Android et sur AMO (pas d'appareil Android ni
  de compte ici). Les gardes nécessaires sont en place (pas de fenêtre séparée, pas de notifications) et testées
  par simulation ; vérifie en premier la connexion CAS sur ton téléphone après l'installation.
- **Fenêtre de connexion CAS absente depuis l'app (téléphone/ordinateur)** : vérifié de bout en bout avec de vrais
  composants (extension réelle + pont `content-bridge.js`/`core/env.js` réel, serveur Odin/CAS simulé localement,
  jamais le vrai serveur — voir `tests/cas_login_window.py` et `tests/cas_login_window_app.py`) — le mécanisme
  fonctionne : si l'extension est installée et active dans le même navigateur que l'app, cliquer « Synchroniser »
  ouvre bien une vraie fenêtre CAS quand la session a expiré. Un vrai bug trouvé au passage : le bouton du menu
  mobile (☰) affichait toujours « Importer mes données » même quand l'extension était détectée, au lieu de
  « Synchroniser » (corrigé dans `core/agenda.js`, `buildMobileMenu`) — ça n'empêchait pas le clic de fonctionner,
  mais le libellé était trompeur. Si le problème persiste en vrai sur ton téléphone/ordinateur après mise à jour,
  la cause la plus probable est que l'extension n'est pas installée (ou pas activée) dans **le même navigateur**
  que l'app — sans elle, l'app ne peut techniquement pas atteindre Odin (pas d'accès cookies cross-origine depuis
  une page web seule) et propose seulement un transfert manuel (lien/QR/fichier).
- **Installabilité PWA (téléphone)** : `app.webmanifest` et `sw.js` vérifiés par simulation (`tests/pwa.py`,
  77/77) — nom, icônes 192/512 + maskable, `display: standalone`, service worker hors ligne. L'installation réelle
  sur un téléphone (icône sur l'écran d'accueil, ouverture en plein écran) reste à confirmer en vrai.

## 6. Synchro directe sur Firefox Android : ce qui dépend de la publication

Sur un téléphone, l'app web (PWA) ne peut pas lire Odin à elle seule (cookies d'un autre site, double authentification dans une
fenêtre CAS). La **vraie synchro sur le téléphone** passe donc par l'extension **Firefox pour Android**, qui n'accepte que les
modules **publiés sur addons.mozilla.org** (ou une collection personnalisée sur Firefox Nightly) : c'est la seule étape qui dépend
de la publication (point 2 ci-dessus).

Ce qui est déjà prêt côté code (testé par simulation dans `tests/store.py`, pas sur un vrai Android) :
- `gecko_android` déclaré (`strict_min_version` 142) et `data_collection_permissions: none` dans le paquet `--store` ;
- connexion CAS dans un **onglet normal** (pas de fenêtre séparée sur Android) et attente de fin de connexion par le bouton « J'y suis » ;
- réglages de notifications masqués (API absentes sur Android), pastille d'icône et alarmes ignorées sans erreur ;
- pont avec l'app (`content-bridge.js`) limité au site publié.

Après publication, sur le téléphone : installer l'extension depuis la page AMO (Firefox ≥ 142), ouvrir l'agenda de l'extension, « Synchroniser »,
te connecter au CAS dans l'onglet qui s'ouvre, puis revenir à l'agenda. Sans publication, le téléphone reste sur le **transfert**
(lien chiffré, QR ou fichier) depuis l'ordinateur, qui fonctionne déjà.

À tester **en vrai** (je n'ai ni Android ni compte AMO ici) : l'installation depuis AMO, la connexion CAS dans l'onglet, le retour automatique à l'agenda.

## 7. App web : ce qui a été vérifié et ce qui reste à tester sur ton téléphone

Vérifié par simulation (Chromium Android, WebKit iPhone, `tests/pwa.py`) : manifeste et icônes (dont maskable), service worker, **hors ligne complet**
(on installe, on coupe le réseau sans rien ouvrir d'autre, puis chaque design, les réglages, l'aide et le guide s'ouvrent), guide d'installation
rappelable depuis le menu, conseils selon le navigateur (Safari, Chrome/Firefox sur iPhone, Firefox Android), notification « prochain cours ».

À vérifier **sur ton téléphone** : l'installation réelle (Android : bouton « Installer l'application » ; iPhone : Partager → Sur l'écran d'accueil),
l'ouverture en mode avion après installation, la feuille de partage native pour l'image d'un jour ou d'une semaine, et l'autorisation
de notification pour le prochain cours (mise à jour à l'ouverture de l'app seulement, pas en continu).

