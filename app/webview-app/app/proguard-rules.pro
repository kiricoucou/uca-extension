# Les méthodes @JavascriptInterface sont appelées par réflexion depuis la WebView :
# R8 doit les garder (nom + présence), sinon le pont JS<->natif casse silencieusement
# en release alors qu'il marche en debug.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Conserver toutes les classes et méthodes de l'application fr.edtuca.app
-keep class fr.edtuca.app.** { *; }
-dontwarn fr.edtuca.app.**
