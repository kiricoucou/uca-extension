# Publier l'extension — guide pas à pas

Tout est prêt : paquets, textes, captures, notes pour le relecteur. Il ne reste que **tes** actions sur les sites
des magasins (compte, formulaire, bouton « Soumettre »), que je ne peux ni ne dois faire à ta place.

Version préparée : **1.37.0** · Extension : « Emploi du temps UCA (non officiel) »

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
python -I -X utf8 tests/build_firefox.py --store      # -> dist/uca-extension-firefox-store-1.37.0.zip
python -I -X utf8 tests/build_chrome.py --store       # -> dist/uca-extension-chrome-store-1.37.0.zip
python -I -X utf8 tests/gen_store.py                  # -> store/screenshots/*.png (1280x800, à refaire si le visuel change)
```

Ces paquets « magasin » diffèrent du paquet de développement : pas de vérificateur de mise à jour GitHub (le
magasin met à jour tout seul), pas d'accès à `raw.githubusercontent.com`, pont limité au site publié
(`kiricoucou.github.io`), aucun fichier de test. Ne publie **jamais** le paquet sans `--store`.

## 2. Firefox (addons.mozilla.org), le plus important : c'est lui qui donne la synchro sur Firefox Android

1. Crée / ouvre ton compte sur <https://addons.mozilla.org> (compte Firefox gratuit).
2. Ouvre <https://addons.mozilla.org/developers/addon/submit/distribution> et choisis **« Sur ce site »**
   (liste publique, mises à jour automatiques). « Par moi-même » donnerait un fichier signé non listé.
3. Envoie `dist/uca-extension-firefox-store-1.37.0.zip`. Le contrôle automatique doit passer sans erreur
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
2. « Nouvel élément » → envoie `dist/uca-extension-chrome-store-1.37.0.zip`.
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
