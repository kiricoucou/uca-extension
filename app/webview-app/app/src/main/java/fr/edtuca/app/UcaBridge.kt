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
}

class UcaBridge(private val host: Activity, private val listener: UcaSyncRequestListener) {
    @JavascriptInterface
    fun requestSync(mode: String) {
        host.runOnUiThread { listener.handleSyncRequest(mode) }
    }

    @JavascriptInterface
    fun onEventsUpdated(json: String) {
        host.runOnUiThread { listener.onEventsUpdated(json) }
    }
}
