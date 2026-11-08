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

    @JavascriptInterface
    fun onEventsUpdated(json: String) {
        host.runOnUiThread { listener.onEventsUpdated(json) }
    }
}
