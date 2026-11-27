package fr.edtuca.app

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener
import java.util.Calendar

/**
 * Recherche des notes sur Moodle depuis l'application : une WebView invisible ouvre Moodle avec la session de
 * l'utilisateur (cookies de l'application, jamais copiés ni envoyés ailleurs), puis core/moodle.js et
 * core/moodle-app.js lisent les notes depuis la page. La comparaison et la validation se font dans l'agenda.
 */
object UcaMoodle {
    private const val PAGE = "/grade/report/overview/index.php"
    private const val LOAD_TIMEOUT_MS = 30_000L
    private const val LOGIN_GRACE_MS = 8_000L      // le temps d'une redirection automatique par le CAS
    private const val STALL_TIMEOUT_MS = 90_000L   // un cours peut demander 3 essais de 20 s
    private const val TOTAL_TIMEOUT_MS = 10 * 60_000L
    private const val POLL_MS = 600L

    private val handler = Handler(Looper.getMainLooper())
    private var running = false

    /** Dernière adresse qui a répondu : celle qu'on propose pour la connexion. */
    private var lastBase: String? = null

    /** Point de reprise fourni par la page (JSON) : les cours déjà lus ne sont pas relus. */
    @Volatile var checkpoint: String = ""

    /** Écran qui attend les résultats. Si l'agenda est fermé pendant la recherche, le résultat est gardé pour son retour. */
    private var sink: ((JSONObject) -> Unit)? = null
    private var parked: JSONObject? = null

    fun attach(listener: (JSONObject) -> Unit) {
        sink = listener
        parked?.let { parked = null; listener(it) }
    }

    fun detach() { sink = null }

    private fun publish(result: JSONObject) {
        val target = sink
        if (target != null) target(result) else parked = result
    }

    /** L'adresse change chaque année (rentrée en septembre) : année en cours, puis la suivante, puis la précédente. */
    fun bases(): List<String> {
        val now = Calendar.getInstance()
        val year = now.get(Calendar.YEAR)
        val start = if (now.get(Calendar.MONTH) >= Calendar.AUGUST) year else year - 1
        return listOf(start, start + 1, start - 1).map { "https://moodle$it.uca.fr" }
    }

    /** Page ouverte pour se connecter : sans session, Moodle renvoie vers sa page de connexion ; connecté, il l'affiche. */
    fun loginUrl(): String = (lastBase ?: bases().first()) + PAGE

    private fun hasSessionCookie(base: String): Boolean =
        CookieManager.getInstance().getCookie("$base/")?.contains("MoodleSession") == true

    private fun issue(code: String, detail: String? = null) = JSONObject().apply {
        put("issue", code)
        if (detail != null) put("detail", detail)
    }

    /**
     * @param manual recherche demandée par l'utilisateur. Sinon, sans session Moodle, on ne charge rien.
     * @param onProgress { done, total, label } pendant la lecture des cours.
     * Le résultat ({ data?, report?, read?, checkpoint?, issue?, detail? }) est remis à l'écran attaché par [attach].
     */
    fun scrape(context: Context, manual: Boolean, onProgress: (JSONObject) -> Unit) {
        if (running) { publish(issue("busy")); return }
        if (!manual && bases().none { hasSessionCookie(it) }) { publish(issue("session")); return }
        running = true
        Run(context.applicationContext, onProgress) { result ->
            running = false
            publish(result)
        }.start()
    }

    private class Run(
        private val context: Context,
        private val onProgress: (JSONObject) -> Unit,
        private val onResult: (JSONObject) -> Unit
    ) {
        private val bases = bases()
        private var web: WebView? = null
        private var finished = false
        /** Cours déjà lus, gardés au fil de l'eau pour reprendre après un arrêt. */
        private var partial: JSONObject? = null
        private val totalTimeout = Runnable { finish(stopped("recherche trop longue")) }

        private fun stopped(detail: String) = issue("error", detail).apply { partial?.let { put("checkpoint", it) } }

        fun start() {
            handler.postDelayed(totalTimeout, TOTAL_TIMEOUT_MS)
            open(0)
        }

        private fun finish(result: JSONObject) {
            if (finished) return
            finished = true
            handler.removeCallbacks(totalTimeout)
            val old = web
            web = null
            handler.post { old?.destroy() }
            onResult(result)
        }

        @SuppressLint("SetJavaScriptEnabled")
        private fun open(index: Int) {
            if (finished) return
            if (index >= bases.size) { finish(issue("error", "Moodle injoignable")); return }
            val base = bases[index]
            val host = Uri.parse(base).host
            val view = WebView(context)
            view.settings.javaScriptEnabled = true
            view.settings.domStorageEnabled = true
            view.settings.allowFileAccess = false
            view.settings.allowContentAccess = false
            view.settings.userAgentString = view.settings.userAgentString.replace("; wv", "")
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
            web?.destroy()
            web = view

            var reading = false
            var abandoned = false
            fun current() = !finished && web === view && !abandoned
            fun nextBase() { if (current() && !reading) { abandoned = true; handler.post { open(index + 1) } } }
            val loadTimeout = Runnable { nextBase() }
            val loginVerdict = Runnable { if (current() && !reading) finish(issue("session")) }

            view.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean =
                    request.url.scheme != "https"

                override fun onPageStarted(v: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                    handler.removeCallbacks(loginVerdict)
                }

                override fun onPageFinished(v: WebView, url: String?) {
                    if (!current() || reading) return
                    val u = Uri.parse(url ?: return)
                    if (u.scheme != "https") return
                    val onMoodle = u.host == host && !Regex("/login/|/cas/", RegexOption.IGNORE_CASE).containsMatchIn(u.path.orEmpty())
                    handler.removeCallbacks(loginVerdict)
                    if (!onMoodle) {
                        // Page de connexion (Moodle ou CAS) : une session CAS encore valable redirige toute seule.
                        if (u.host == host || u.host == "ent.uca.fr") {
                            handler.removeCallbacks(loadTimeout)
                            if (u.host == host) lastBase = base
                            handler.postDelayed(loginVerdict, LOGIN_GRACE_MS)
                        }
                        return
                    }
                    handler.removeCallbacks(loadTimeout)
                    lastBase = base
                    reading = true
                    // Le point de reprise est réécrit par JSONObject : jamais de texte libre injecté dans la page.
                    val resume = try { if (checkpoint.isEmpty()) "null" else JSONObject(checkpoint).toString() } catch (e: Exception) { "null" }
                    val code = try { "window.__ucaMoodleCheckpoint = " + resume + ";\n" + script("moodle.js") + "\n" + script("moodle-scan.js") + "\n" + script("moodle-app.js") }
                    catch (e: Exception) { finish(issue("error", "fichiers de lecture introuvables")); return }
                    v.evaluateJavascript(code) { poll(view, host, "", System.currentTimeMillis()) }
                }

                override fun onReceivedError(v: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) { handler.removeCallbacks(loadTimeout); nextBase() }
                }

                override fun onReceivedHttpError(v: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (!request.isForMainFrame || !current() || reading || request.url.host != host) return
                    if (response.statusCode >= 500) finish(issue("serviceDown", "HTTP " + response.statusCode))
                    else if (response.statusCode == 404) nextBase()
                }
            }
            handler.postDelayed(loadTimeout, LOAD_TIMEOUT_MS)
            view.loadUrl(base + PAGE)
        }

        private fun poll(view: WebView, host: String?, seen: String, seenAt: Long) {
            if (finished || web !== view) return
            // On ne relit que la page Moodle : si elle est partie ailleurs, la lecture s'arrête.
            if (Uri.parse(view.url.orEmpty()).host != host) { finish(issue("session").apply { partial?.let { put("checkpoint", it) } }); return }
            view.evaluateJavascript("(function(){return JSON.stringify(window.__ucaMoodleJob||null);})()") { raw ->
                if (finished || web !== view) return@evaluateJavascript
                val job = try {
                    (JSONTokener(raw).nextValue() as? String)?.let { JSONTokener(it).nextValue() as? JSONObject }
                } catch (e: Exception) { null }
                val result = job?.optJSONObject("result")
                if (result != null) { finish(result); return@evaluateJavascript }
                var mark = seen
                var at = seenAt
                if (job != null) {
                    job.optJSONObject("checkpoint")?.let { partial = it }
                    val now = "${job.optInt("done")}/${job.optInt("total")}/${job.optString("label")}/${job.optInt("beat")}"
                    if (now != seen) {
                        mark = now
                        at = System.currentTimeMillis()
                        if (job.optInt("total") > 0) onProgress(job)
                    }
                }
                if (System.currentTimeMillis() - at > STALL_TIMEOUT_MS) { finish(stopped("Moodle ne répond plus")); return@evaluateJavascript }
                handler.postDelayed({ poll(view, host, mark, at) }, POLL_MS)
            }
        }

        /** Version la plus récente du script : celle de la mise à jour automatique (signée), sinon celle de l'APK. */
        private fun script(name: String): String =
            LiveUpdate.liveFile(context, "core/$name")?.readText()
                ?: context.assets.open("legacy-site/core/$name").bufferedReader().use { it.readText() }
    }
}
