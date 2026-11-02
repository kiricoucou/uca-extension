package fr.edtuca.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import org.json.JSONObject

/**
 * Écran Agenda = notre calendrier existant (site/index.html, copié tel
 * quel dans assets/legacy-site/), chargé dans une WebView. Le pont JS
 * (android-bridge.js + UcaBridge) reproduit exactement les messages que
 * content-bridge.js envoie dans l'extension Chrome, donc index.html n'a
 * besoin d'AUCUNE modification : même code, même logique de connexion et
 * de récupération des données, juste un transport différent (JS natif
 * Android au lieu de chrome.runtime).
 */
class AgendaFragment : Fragment(), UcaSyncRequestListener {

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val ASSET_PREFIX = "/assets/legacy-site/"
        private val ALLOWED_SYNC_MODES = setOf("resync", "login")
        // Partagés entre instances du fragment (recréé à chaque changement d'onglet).
        val nativeSyncExecutor: java.util.concurrent.ExecutorService =
            java.util.concurrent.Executors.newSingleThreadExecutor()
        @Volatile var lastSyncedHash: Int = 0
    }

    private lateinit var webView: WebView
    private var bridgeScript: String = ""

    private val loginLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result: ActivityResult ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            doResync(silent = false)
        } else {
            deliver(mapOf("type" to "UCA_SYNC_RESULT", "ok" to false, "error" to "Connexion annulée"))
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_agenda, container, false)
        webView = root.findViewById(R.id.webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        CookieManager.getInstance().setAcceptCookie(true)
        // addJavascriptInterface s'injecte dans toutes les frames et origines.
        // shouldOverrideUrlLoading empêche la page principale de quitter les assets ;
        // il ne couvre PAS les iframes : c'est la CSP de chaque page (default-src 'self', frame-src 'self')
        // qui empêche un iframe tiers d'être chargé. Ne pas affaiblir cette CSP.
        webView.addJavascriptInterface(UcaBridge(requireActivity(), this), "AndroidUCA")

        bridgeScript = requireContext().assets.open("android-bridge.js").bufferedReader().use { it.readText() }

        // Pages mises à jour depuis GitHub (LiveUpdate : paquet signé, vérifié) : prioritaires sur celles de l'APK.
        val appCtx = requireContext().applicationContext

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(requireContext()))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                val path = url.path ?: ""
                if (request.method == "GET" && url.host == ASSET_HOST && path.startsWith(ASSET_PREFIX)) {
                    val live = LiveUpdate.liveFile(appCtx, path.removePrefix(ASSET_PREFIX))
                    if (live != null) {
                        try { return WebResourceResponse(getMimeType(path), "UTF-8", live.inputStream()) } catch (_: Exception) {}
                    }
                }
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "https" && request.url.host == ASSET_HOST &&
                    (request.url.path ?: "").startsWith(ASSET_PREFIX)) return false
                // Liens externes (Odin, etc.) : navigateur du téléphone, jamais dans cette WebView.
                if (request.url.scheme == "https") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (url != null && Uri.parse(url).host == ASSET_HOST) {
                    view.evaluateJavascript(bridgeScript, null)
                    applyChosenDesign(view, url)
                }
            }
        }

        val demo = PrefsStore.qaDemo(requireContext())
        webView.loadUrl("https://$ASSET_HOST/assets/legacy-site/index.html" + if (demo) "?demo=1" else "")

        // Au lancement de l'écran : resync silencieuse (comme trySilentResync
        // côté extension), sans ouvrir de fenêtre de connexion.
        if (!demo) doResync(silent = true)

        return root
    }

    /** Si le design choisi dans les Préférences n'est pas celui affiché, on bascule l'agenda dessus (identifiant vérifié). */
    private fun applyChosenDesign(view: WebView, url: String) {
        val wanted = PrefsStore.design(requireContext()) ?: return
        val shown = Regex("/designs/([a-z]+)/").find(url)?.groupValues?.get(1) ?: return
        if (shown == wanted) return
        view.evaluateJavascript(
            "(function(){try{var s=JSON.parse(localStorage.getItem('uca_store')||'{}');s.uca_design='" + wanted + "';" +
                "localStorage.setItem('uca_store',JSON.stringify(s));}catch(e){}" +
                "location.replace('/assets/legacy-site/designs/" + wanted + "/agenda.html'+location.search+location.hash);})()", null)
    }

    /** Appelé depuis UcaBridge quand la page demande une synchro. */
    override fun handleSyncRequest(mode: String) {
        if (mode !in ALLOWED_SYNC_MODES) return
        if (mode == "login") {
            loginLauncher.launch(Intent(requireContext(), LoginActivity::class.java))
        } else {
            doResync(silent = true)
        }
    }

    private fun doResync(silent: Boolean) {
        if (!silent) {
            deliver(mapOf("type" to "UCA_SYNC_PROGRESS", "stage" to "resync"))
        }
        val ctx = requireContext()
        UcaSync.resync(ctx) { text, sessionExpired ->
            if (!isAdded) return@resync
            when {
                sessionExpired -> {
                    deliver(mapOf("type" to "UCA_SESSION_STATE", "expired" to true))
                    (requireActivity() as MainActivity).requireLogin()
                }
                text == "MAINTENANCE_ERROR" -> {
                    deliver(mapOf("type" to "UCA_SYNC_RESULT", "ok" to false, "error" to "Site Odin en maintenance. Réessayez plus tard."))
                }
                text.isNullOrBlank() || !UcaSync.containsSchedule(text) -> {
                    deliver(mapOf("type" to "UCA_SYNC_RESULT", "ok" to false, "error" to "Site Odin temporairement indisponible ou aucun emploi du temps disponible pour votre groupe."))
                    // Tenter quand même la synchronisation des notes et absences
                    syncAbsencesAndNotes(ctx)
                }
                else -> {
                    PrefsStore.setLoggedIn(requireContext(), true)
                    (requireActivity() as MainActivity).clearSessionExpired()
                    deliver(mapOf("type" to "UCA_SESSION_STATE", "expired" to false))
                    deliver(mapOf("type" to "UCA_SYNC_RESULT", "ok" to true, "text" to text, "silent" to silent))
                    // Synchro complète en une seule fois : Notes + Absences + Profil étudiant
                    syncAbsencesAndNotes(ctx)
                }
            }
        }
    }

    /** Synchronise les absences, le relevé de notes et le profil étudiant en une seule opération */
    private fun syncAbsencesAndNotes(ctx: Context) {
        // 1. Absences
        UcaSync.scrapeAbsences(ctx) { absences ->
            if (isAdded && absences != null) {
                deliver(mapOf("type" to "UCA_ABSENCES_RESULT", "ok" to true, "absences" to absences))
            }
        }
        // 2. Relevé de notes
        UcaSync.scrapeNotes(ctx) { releve ->
            if (isAdded && releve != null) {
                deliver(mapOf("type" to "UCA_NOTES_RESULT", "ok" to true, "releve" to releve))
                notifyNewGrades(ctx, releve)
            }
        }
        // 3. Profil étudiant
        val sName = PrefsStore.studentName(ctx)
        val sId = PrefsStore.studentId(ctx)
        val sEmail = PrefsStore.studentEmail(ctx)
        val sGroup = PrefsStore.studentGroup(ctx)
        if (sName.isNotBlank() || sId.isNotBlank()) {
            deliver(mapOf(
                "type" to "UCA_PROFILE_RESULT",
                "ok" to true,
                "name" to sName,
                "id" to sId,
                "email" to sEmail,
                "group" to sGroup
            ))
        }
    }

    /** Relevé de notes silencieux */
    private fun syncNotesQuietly() {
        val ctx = context ?: return
        syncAbsencesAndNotes(ctx)
    }

    /** Compare le nombre de notes avec le relevé précédent : une nouvelle note crée une notification. */
    private fun notifyNewGrades(ctx: Context, releve: JSONObject) {
        try {
            val seen = HashSet<String>()
            var count = 0
            val ues = releve.optJSONArray("ue") ?: return
            for (i in 0 until ues.length()) {
                val mats = ues.getJSONObject(i).optJSONArray("matieres") ?: continue
                for (j in 0 until mats.length()) {
                    val m = mats.getJSONObject(j)
                    val evals = m.optJSONArray("evals") ?: continue
                    for (k in 0 until evals.length()) {
                        val e = evals.getJSONObject(k)
                        if (!e.isNull("note") && seen.add(m.optString("label") + "|" + e.optString("label"))) count++
                    }
                }
            }
            val last = PrefsStore.gradeCount(ctx)
            if (last in 0 until count) {
                val n = count - last
                NotifStore.post(ctx, "note", if (n > 1) "$n nouvelles notes" else "Nouvelle note disponible", "Consulte ton relevé de notes")
            }
            PrefsStore.setGradeCount(ctx, count)
        } catch (_: Exception) { }
    }

    /** Resynchronise tout de suite (après une reconnexion). */
    fun resyncNow() { if (isAdded) doResync(silent = false) }

    /** Prévient la page que la session est (ou n'est plus) expirée. */
    fun notifySessionExpired(expired: Boolean) {
        if (isAdded) deliver(mapOf("type" to "UCA_SESSION_STATE", "expired" to expired))
    }

    /** La page vient de changer de design (menu « Changer de design ») : on s'en souvient pour toute l'app. */
    override fun onDesignChanged(id: String) {
        if (isAdded) PrefsStore.setDesign(requireContext(), id)
    }

    /** Appelé depuis UcaBridge (window.__ucaOnEvents côté JS) à chaque rendu du calendrier. */
    override fun onEventsUpdated(json: String) {
        if (!isAdded) return
        val ctx = requireContext().applicationContext
        // render() tourne à chaque swipe et toutes les 60 s : un seul thread sérialisé
        // (sinon deux delete/insert concurrents dupliquent les cours) et rien si la liste
        // n'a pas changé.
        nativeSyncExecutor.execute {
            val events = try { UcaEvent.parseList(json) } catch (e: Exception) { return@execute }
            // Liste vide = page pas encore chargée / pas de consentement : ne jamais
            // vider le calendrier du téléphone pour ça.
            if (events.isEmpty()) return@execute
            val hash = events.hashCode()
            if (hash == lastSyncedHash) return@execute
            lastSyncedHash = hash
            try {
                if (PrefsStore.syncTel(ctx)) PhoneCalendarSync.sync(ctx, events)
                if (PrefsStore.notifCours(ctx)) CourseReminderScheduler.schedule(ctx, events)
                WidgetEventsStore.save(ctx, json)
                AgendaWidgetProvider.requestUpdate(ctx)
            } catch (e: Exception) { }
        }
    }

    override fun onDestroyView() {
        webView.destroy()
        super.onDestroyView()
    }

    /** Livre un message JS à la page, format identique à UCA_SYNC_RESULT côté extension. */
    private fun deliver(payload: Map<String, Any?>) {
        val json = JSONObject(payload).toString()
        val escaped = JSONObject.quote(json)
        if (!isAdded) return
        requireActivity().runOnUiThread {
            if (isAdded) webView.evaluateJavascript("window.__ucaDeliver && window.__ucaDeliver($escaped)", null)
        }
    }

    fun reloadWebView() {
        if (!isAdded) return
        requireActivity().runOnUiThread {
            if (isAdded) webView.reload()
        }
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") -> "application/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".gif") -> "image/gif"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".webp") -> "image/webp"
            else -> "application/octet-stream"
        }
    }
}
