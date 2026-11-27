package fr.edtuca.app

import android.app.Activity
import android.webkit.JavascriptInterface

/**
 * Pont exposé à la page web (window.AndroidUCA depuis android-bridge.js).
 * Équivalent natif de chrome.runtime.sendMessage côté extension.
 */
interface UcaSyncRequestListener {
    fun handleSyncRequest(mode: String)
    fun onEventsUpdated(json: String)
    fun onDesignChanged(id: String)
    fun handleClassRequest()
    fun onWidgetData(json: String)
    fun handleMoodleRequest(manual: Boolean)
    fun handleMoodleLogin()
    fun onMoodlePending(count: Int)
}

class UcaBridge(private val host: Activity, private val listener: UcaSyncRequestListener) {
    @JavascriptInterface
    fun requestSync(mode: String) {
        host.runOnUiThread { listener.handleSyncRequest(mode) }
    }

    /** Le filtre « Emploi du temps personnel » est décoché sans données de classe : la page demande à les récupérer. */
    @JavascriptInterface
    fun requestClass() {
        host.runOnUiThread { listener.handleClassRequest() }
    }

    @JavascriptInterface
    fun onDesignChanged(id: String) {
        host.runOnUiThread { listener.onDesignChanged(id) }
    }

    /** Résumé des données pour les widgets de l'écran d'accueil (core/widgets.js, snapshot). */
    @JavascriptInterface
    fun onWidgetData(json: String) {
        host.runOnUiThread { listener.onWidgetData(json) }
    }

    /** Recherche des notes sur Moodle (UcaMoodle.kt) ; le résultat revient par un message UCA_MOODLE_RESULT. */
    @JavascriptInterface
    fun requestMoodle(manual: Boolean) {
        host.runOnUiThread { listener.handleMoodleRequest(manual) }
    }

    @JavascriptInterface
    fun requestMoodleLogin() {
        host.runOnUiThread { listener.handleMoodleLogin() }
    }

    /** La page a trouvé de nouvelles notes à valider : notification de l'application. */
    @JavascriptInterface
    fun notifyMoodle(count: Int) {
        if (count in 1..400) host.runOnUiThread { listener.onMoodlePending(count) }
    }

    @JavascriptInterface
    fun onEventsUpdated(json: String) {
        host.runOnUiThread { listener.onEventsUpdated(json) }
    }
}
