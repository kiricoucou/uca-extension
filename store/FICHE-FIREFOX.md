# Fiche addons.mozilla.org (à copier dans le formulaire)

## Nom (50 caractères max)
Emploi du temps UCA (non officiel)

## Résumé (250 caractères max)
Ton emploi du temps, tes notes, tes absences et tes devoirs Odin (UCA) dans un agenda clair : rappels, simulateur de moyenne, 4 designs. Non officiel. Tout reste dans ton navigateur : aucun serveur, aucune donnée envoyée à un tiers.

(Longueur : 232 caractères.)

## Description (copier tel quel ; AMO accepte un peu de Markdown)

**Outil non officiel, non affilié à l'Université Clermont Auvergne (UCA).** Il lit ton emploi du temps, tes absences et tes notes sur Odin avec **ta propre session** et les affiche dans un agenda plus pratique.

**Agenda**
- Vues jour, 3/5/6 jours, semaine et mois, sans défilement : la journée la plus longue tient à l'écran.
- Prochain cours avec compte à rebours (« Examen dans 3 h » quand c'en est un), jours fériés, couleur par matière, blocs compacts.
- Changements d'emploi du temps détaillés (salle, horaire, enseignant, annulation…), marqués dans l'agenda.
- Filtres (CM, TD, TP, examens, matières), export .ics vers Google Agenda / Outlook / téléphone, image d'un jour ou d'une semaine à partager.
- **Devoirs et examens** : liste de devoirs liée aux matières avec compte à rebours, examens de l'emploi du temps ajoutés tout seuls, rappel la veille au soir.
- Raccourcis clavier : ← → T F J S M.

**Notes et absences**
- Relevé de notes avec moyenne générale, nouvelles notes en couleur, **simulateur d'objectif** (« quelle note pour avoir 10 ? »), graphiques d'évolution, projection du semestre, matières à prioriser, examens à venir.
- Détail des absences et alerte au seuil de ton choix.

**Rappels (ordinateur)**
- Notification avant chaque cours, synchronisation automatique en arrière-plan (sans jamais ouvrir de fenêtre de connexion toute seule), pastille sur l'icône, alertes de changement d'emploi du temps et de nouvelle note.

**4 designs au choix**, identiques en fonctionnalités : animé (sombre), professionnel (clair), bulletin (clair et dense), carnet (papier). Option : design clair le jour, sombre le soir, selon le thème de ton appareil.

**Statut des sites** : un tableau de bord dans Paramètres montre en direct si Odin, la connexion UCA, Moodle et la messagerie répondent.

**Sur téléphone** : sur Firefox pour Android, installe l'extension et synchronise comme sur ordinateur. Sinon, un lien de partage **chiffré** (AES-256) permet d'envoyer ton agenda vers l'application web installable, sans aucun serveur.

**Confidentialité**
- Aucun compte, aucune publicité, aucune télémétrie, aucun traceur.
- Tes données restent dans le stockage local de ton navigateur. Rien n'est envoyé à l'éditeur ni à un tiers.
- Ton mot de passe est saisi uniquement sur le site de l'UCA ; l'extension ne le lit pas.
- Liste complète des connexions réseau : https://kiricoucou.github.io/uca-extension/confidentialite.html

**Limites** : l'extension dépend de l'affichage d'Odin ; si l'UCA le modifie, la lecture peut cesser de fonctionner jusqu'à une mise à jour (un message le signale, tes anciennes données restent). Les notifications système n'existent pas sur Firefox pour Android.

## Catégories
**Autre (Other)** (aucune catégorie ne correspond mieux ; ne pas en ajouter d'autre).
Étiquettes (tags) : `emploi du temps`, `agenda`, `notes`, `étudiant`, `UCA`

## Adresses
- Page d'accueil : https://kiricoucou.github.io/uca-extension/
- Aide / support : https://kiricoucou.github.io/uca-extension/aide.html
- Où signaler un problème (suivi des tickets) : https://github.com/kiricoucou/uca-extension/issues
- Politique de confidentialité : https://kiricoucou.github.io/uca-extension/confidentialite.html
- E-mail d'assistance : (celui que tu veux rendre public ; AMO le demande)

## Licence
Tous droits réservés (All Rights Reserved).

## Captures d'écran (dans `store/screenshots/`, 1280×800) et légendes
1. `1-semaine-professionnel.png` — Agenda de la semaine, design professionnel (clair).
2. `2-semaine-anime.png` — Même agenda, design animé (sombre), avec le cours en cours.
3. `3-devoirs-bulletin.png` — Design bulletin avec la liste des devoirs et l'examen à venir.
4. `4-notes-simulateur.png` — Moyenne, examens à venir, simulateur d'objectif et courbe d'évolution.
5. `5-parametres-statut.png` — Statut des sites en direct (Odin, connexion UCA, Moodle…).

## Cases du formulaire
- Compatibilité : Firefox pour ordinateur **et** Firefox pour Android.
- Code source à fournir : **Non** (aucune minification, aucun outil de génération : le zip est le dépôt tel quel, sans `tests/`).
- Données collectées (Firefox) : **aucune** (déjà déclaré dans le manifeste).
- Notes pour le relecteur : coller `NOTES-RELECTEUR.md`.
