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
