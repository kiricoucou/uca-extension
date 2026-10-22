# Fiche Chrome Web Store (à copier dans la console développeur)

## Nom
Emploi du temps UCA (non officiel)

## Résumé (132 caractères max, repris du manifeste)
Emploi du temps, notes et absences de l'UCA (Odin) dans ton navigateur. Non officiel, aucune donnée envoyée à un tiers.

## Description détaillée
Même texte que `FICHE-FIREFOX.md` (section Description). Retire la phrase sur Firefox pour Android.

## Catégorie
Productivité → Éducation

## Langue
Français

## Objet unique (« single purpose »)
Afficher l'emploi du temps, les notes et les absences de l'étudiant, lus sur Odin avec sa propre session, dans un agenda local.

## Justification des permissions
- **storage** : enregistre sur l'appareil l'emploi du temps, les notes, les absences et les réglages. Rien n'est envoyé ailleurs.
- **scripting** : lit le texte des pages Odin (emploi du temps, absences, notes) ouvertes en arrière-plan avec la session de l'étudiant.
- **cookies** : lit la durée restante de la session UCA (affichage) et, sur clic « Déconnexion », supprime uniquement les cookies de ent.uca.fr et odin.iut.uca.fr.
- **alarms** : rappels de cours, synchronisation automatique, mise à jour de la pastille de l'icône.
- **notifications** : rappels avant les cours et alertes (changement d'emploi du temps, nouvelle note, absences). Désactivables.
- **Accès aux hôtes https://ent.uca.fr/\* et https://odin.iut.uca.fr/\*** : connexion CAS officielle et lecture des pages Odin de l'étudiant.
- **Script de contenu sur https://kiricoucou.github.io/uca-extension/\*** : relie le site / l'application web de l'extension à l'extension (bouton « Synchroniser » du site). Il ne transmet aucune autre donnée.

## Code distant
**Non.** Tout le code est dans le paquet ; aucune bibliothèque ni police n'est chargée depuis Internet.

## Usage des données (onglet « Confidentialité »)
- Types de données traités : **Contenu de sites web** (le texte des pages Odin de l'étudiant), conservé **uniquement sur l'appareil**.
- Ne rien transmettre hors de l'appareil : aucune des données n'est vendue, transférée à un tiers, utilisée hors de la fonction unique, ni utilisée pour une évaluation de solvabilité. Coche les trois attestations.
- URL de la politique de confidentialité : https://kiricoucou.github.io/uca-extension/confidentialite.html

## Captures d'écran (1280×800, 5 maximum)
`store/screenshots/1` à `5` (légendes dans `FICHE-FIREFOX.md`). Visuel promotionnel (440×280) : facultatif.

## Site web / assistance
- https://kiricoucou.github.io/uca-extension/
- https://github.com/kiricoucou/uca-extension/issues
