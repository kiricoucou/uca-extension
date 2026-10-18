# Emploi du temps UCA — extension Chrome (non officielle)

Extension Chrome/Edge (Manifest V3) qui récupère ton emploi du temps, tes absences et ton relevé de notes depuis Odin (IUT Clermont Auvergne) avec **ta propre session**, et les affiche dans un agenda dans la barre d'outils.

Non officielle, non affiliée à l'Université Clermont Auvergne. Aucune donnée n'est envoyée à un serveur tiers : tout reste stocké localement dans ton navigateur (`chrome.storage.local`).

## Fonctionnalités

- **Synchronisation** : connexion CAS (fenêtre dédiée, 15 min pour valider la double authentification) puis reconnexion silencieuse tant que la session Odin reste valide. Détection automatique de session expirée.
- **Emploi du temps** : vues Jour / 3 jours / 5 jours / Semaine / Mois, zoom réglable, grille horaire.
- **Absences** : déclarées, justifiées, non justifiées, avec motif présenté, journées non justifiées — synchronisées en même temps que l'emploi du temps.
- **Relevé de notes** : tableau UE → matière → évaluation (Coeff / Note / Moy / Maxi / Mini), copié depuis Odin, en-tête fixé au scroll.
- **Notes personnelles** : un champ texte par cours (rappel, révisions...), sauvegardé localement.
- **Page d'aide intégrée** (`aide.html`, bouton ❓) qui explique chaque fonctionnalité.
- Responsive (menu hamburger sous 820px), thème sombre turquoise.

## Installation (mode développeur)

1. Télécharge ou clone ce dépôt.
2. Ouvre `chrome://extensions`.
3. Active le **Mode développeur** (coin supérieur droit).
4. Clique **Charger l'extension non empaquetée**, sélectionne le dossier du dépôt.
5. Clique l'icône de l'extension → **Se connecter**, connecte-toi sur le CAS UCA quand la fenêtre s'ouvre.

Firefox : utiliser `manifest.firefox.json` (renommer en `manifest.json` ou charger via `about:debugging` → *Ce Firefox* → *Charger un module complémentaire temporaire*).

## Structure

| Fichier | Rôle |
|---|---|
| `background.js` | Service worker : connexion CAS, scraping (emploi du temps/absences/notes), synchronisation silencieuse |
| `popup.html` / `popup.js` | Popup barre d'outils (aperçu rapide) |
| `agenda.html` / `agenda.js` | Agenda complet (nouvel onglet) : grille, absences, notes, notes perso |
| `content-bridge.js` | Relais de messages vers le site web (localhost/file) |
| `aide.html` | Page d'aide |
| `confidentialite.html` | Politique de confidentialité |

## Confidentialité

Voir [`confidentialite.html`](confidentialite.html) : l'extension utilise uniquement ta session existante sur `odin.iut.uca.fr` et `ent.uca.fr`, ne transmet rien à un tiers, tout reste local.

## Licence

Projet personnel, non affilié à l'UCA. Utilise à tes risques, l'UCA peut modifier Odin à tout moment et casser le scraping.
