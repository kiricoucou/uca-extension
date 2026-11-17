# Rapport de Test Complet du Parcours Utilisateur sur Ordinateur
*Date d'exécution : 2026-11-18 00:53:11*

## 1. Synthèse globale
- **Résultat** : 32/32 vérifications passées avec succès (100 %).
- **Plates-formes testées** : Windows 11 Desktop, Google Chrome (multi-profils indépendants).
- **Exigences de sécurité** : Zéro demande de mot de passe administrateur (UAC), zéro demande de mot de passe externe, aucune élévation de privilèges requise.
- **Pilotes automatiques** : Fonctionnement nominal sans erreur de `installer-windows.bat` et `maj-extension.bat`.

## 2. Détail des 3 méthodes d'installation sur Ordinateur

### Méthode 1 : Installateur automatique Windows (.bat - Pilote automatique)
- **Scripts** : `extension/installer-windows.bat` & `extension/maj-extension.bat`
- **Profil testé** : Profil Chrome A (isolé, créé automatiquement)
- **Résultats validés** :
  - Aucune invite de commande administrateur ni mot de passe exigé (mode standard sécurisé).
  - Téléchargement sécurisé et extraction propre dans le dossier de destination.
  - Enregistrement du chemin d'installation pour le script de mise à jour automatique.
  - Mise à jour automatique vérifiée par signature (`maj-extension.bat /force`).
  - Chargement de l'extension et ouverture immédiate de l'agenda avec données d'exemple.
  - Consultation du panneau de notes et du panneau d'absences 100% fonctionnels.
  - Suite `tests/installers.py` : 24/24 vérifications validées.
  - Suite `tests/bat_update.py` : 24/24 vérifications validées.

### Méthode 2 : Installation manuelle via ZIP (Chrome / Edge / Brave)
- **Paquet** : `extension/uca-extension-chrome.zip`
- **Profil testé** : Profil Chrome B (indépendant de Profil A, créé dynamiquement)
- **Résultats validés** :
  - Téléchargement direct depuis la page `extension/index.html` via le bouton `#dlTop` (flux réel Playwright).
  - Décompression standard du ZIP dans un répertoire dédié sans mot de passe.
  - Chargement de l'extension non empaquetée dans le profil Chrome B.
  - Fonctionnalités testées de bout en bout :
    - Affichage de l'agenda en vue semaine.
    - Ouverture de la fiche détaillée d'un cours avec saisie et sauvegarde de note personnelle.
    - Navigation fluide entre les différentes vues temporelles (Jour, Semaine, Mois).
    - Filtre de recherche temps réel (« Web ») avec masquage/affichage dynamique des cours correspondants.
    - Changement de design à chaud (Studio vers Anime) avec sauvegarde immédiate dans `chrome.storage.local`.
    - Rechargement de l'agenda dans le style Anime avec affichage correct de tous les cours.

### Méthode 3 : Application Web / PWA sur Ordinateur (Desktop)
- **Pages** : `appli.html` & `app/shell.html`
- **Profil testé** : Profil Chrome C (résolution grand écran 1440x900)
- **Résultats validés** :
  - Page de présentation `appli.html` parfaitement consultable sur ordinateur.
  - Coque applicative `app/shell.html` pleinement opérationnelle sur écran desktop avec barre de navigation (`#bottomNav`).
  - Service Worker (`sw.js`) actif et opérationnel pour le cache et le mode hors-ligne.
  - Emploi du temps consultable sans mot de passe ni compte obligatoire en mode démo / import local.

## 3. Matrice des vérifications
| Catégorie | Vérification | Résultat |
|---|---|---|
| Securite | installer-windows.bat s'execute en droits standard sans mot de passe | OK |
| Securite | maj-extension.bat n'exige aucun droit administrateur ni mot de passe | OK |
| Securite | installer-windows.bat a des fins de ligne CRLF valides | OK |
| Securite | maj-extension.bat a des fins de ligne CRLF valides | OK |
| Pilote Auto | Execution du pilote automatique (suite tests/installers.py 24/24) | OK |
| Pilote Auto | Script de mise a jour maj-extension.bat (suite tests/bat_update.py 24/24) | OK |
| Pilote Auto | Fichiers installes par l'automatisation (manifest.json) | OK |
| Pilote Auto | Fichiers installes par l'automatisation (core/agenda.js) | OK |
| Pilote Auto | Execution directe de maj-extension.bat sans mot de passe | OK |
| Profil A (Auto) | L'extension s'ouvre sans mot de passe | OK |
| Profil A (Auto) | Emploi du temps affiche correctement (17 cours) | OK |
| Profil A (Auto) | Panneau de notes accessible et fonctionnel | OK |
| Profil A (Auto) | Panneau d'absences accessible et fonctionnel | OK |
| Methode ZIP | Telechargement direct du ZIP depuis le site | OK |
| Methode ZIP | Decompression reussie du ZIP sans mot de passe | OK |
| Profil B (ZIP) | Ouverture du dialogue detail de cours | OK |
| Profil B (ZIP) | Note personnelle enregistree sans mot de passe | OK |
| Profil B (ZIP) | Navigation vers la vue Jour | OK |
| Profil B (ZIP) | Navigation vers la vue Mois | OK |
| Profil B (ZIP) | Filtre de recherche 'Web' actif (3 cours filtres) | OK |
| Profil B (ZIP) | Changement de design memorise (Studio -> Anime) | OK |
| Profil B (ZIP) | Agenda fonctionne dans le design Anime (3 cours) | OK |
| Methode PWA Desktop | Page de presentation de l'application accessible sur ordinateur | OK |
| Methode PWA Desktop | Ecran d'accueil et guide de premiere visite de l'app | OK |
| Methode PWA Desktop | Choix du design dans l'application PWA | OK |
| Methode PWA Desktop | Ecran d'import sans mot de passe accessible | OK |
| Methode PWA Desktop | Coque applicative active avec barre de navigation desktop | OK |
| Methode PWA Desktop | Service Worker present pour fonctionnement hors-ligne | OK |
| Non-Regression | Suite premier demarrage first_run.py (9/9 OK) | OK |
| Non-Regression | Suite 5 designs demo_scenarios.py (49/49 OK) | OK |
| Non-Regression | Suite d'accessibilite a11y.py (37/37 OK) | OK |
| Non-Regression | Suite de la page extension_page.py (28/28 OK) | OK |

## 4. Emplacement des captures d'écran du tutoriel
- **Dossier physique sur disque** : `aide-install/img/`
- **Nombre total de captures** : 42 captures WebP (0 doublon, 100% uniques)
  - `inst-01.webp` à `inst-12.webp` : 12 captures de l'installateur automatique Windows
  - `zip-01.webp` à `zip-16.webp` : 16 captures de la méthode manuelle ZIP
  - `pwa-01.webp` à `pwa-14.webp` : 14 captures du tutoriel application mobile/PWA
- **Visualisation interactive** : [installation.html](installation.html)
- **Métadonnées et descriptifs** : `aide-install/steps.json`