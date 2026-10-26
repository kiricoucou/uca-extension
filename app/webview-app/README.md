# EdtUca — app Android (WebView)

App Android neuve (pas dérivée du code de MyUCA — aucun code officiel UCA
dedans, juste le même thème de couleurs) qui embarque notre calendrier
(`site/index.html`, copié dans `app/src/main/assets/legacy-site/`) dans une
WebView, avec la même logique de connexion/synchro que l'extension Chrome :

- `UcaBridge.kt` + `android-bridge.js` : pont JS ↔ natif, équivalent de
  `content-bridge.js` côté extension. **`index.html` n'est pas modifié** —
  les mêmes messages (`UCA_SYNC_REQUEST`, `UCA_SYNC_RESULT`,
  `UCA_SESSION_STATE`...) transitent juste par `evaluateJavascript` au lieu
  de `chrome.runtime`.
- `UcaSync.kt` : portage direct de `background.js` (mêmes URLs EDT/CAS,
  même regex de détection du planning, même stratégie de retry 60×1s pour
  laisser le temps à l'AJAX Odin de charger le vrai contenu).
- `LoginActivity.kt` : équivalent du popup CAS ouvert par l'extension —
  aucun timeout artificiel, fermeture automatique dès la redirection vers
  `odin.iut.uca.fr`.

## ⚠️ Pas buildé/testé ici

Cette machine n'a pas le SDK Android / Gradle installés, donc ce code n'a
pas pu être compilé ni testé. Pour le builder :

1. Ouvrir le dossier `webview-app/` dans Android Studio.
2. Laisser Gradle synchroniser (télécharge le SDK/AGP/Kotlin si besoin).
3. Lancer sur un appareil/émulateur (bouton ▶️, ou `./gradlew installDebug`).

## État / limites connues

- **Bottom nav complète** (Accueil / Études / Agenda / Lieux / Compte),
  `MainActivity` héberge des Fragments échangés via `BottomNavigationView` :
  - Agenda (`AgendaFragment`) : la WebView + sync, inchangé fonctionnellement.
  - Accueil (`HomeFragment`), Études (`EtudesFragment`), Lieux universitaires
    (`LieuxFragment`), Mon compte (`CompteFragment`) : écrans natifs reproduisant
    le contenu vu dans la vidéo officielle.
  - Écrans secondaires ouverts par-dessus (back stack) : Messagerie, Notifications,
    Livres empruntés.
- Carte Lieux universitaires = mock visuel (pins fixes), pas de vraies tuiles
  ni d'occupation en direct — pas d'API fournie pour ça.
- Messagerie = maquette (liste de mails statique), pas de vrai webmail branché.
- Icône de lancement : logo UCA officiel (le même que l'extension).
