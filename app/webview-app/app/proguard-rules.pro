# Les méthodes @JavascriptInterface sont appelées par réflexion depuis la WebView :
# R8 doit les garder (nom + présence), sinon le pont JS<->natif casse silencieusement
# en release alors qu'il marche en debug.
-keepclassmembers class fr.edtuca.app.UcaBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# org.json est utilisé via réflexion-friendly API standard, pas de règle spécifique requise,
# mais on garde nos propres modèles de données pour éviter toute surprise de sérialisation.
-keep class fr.edtuca.app.UcaEvent { *; }
