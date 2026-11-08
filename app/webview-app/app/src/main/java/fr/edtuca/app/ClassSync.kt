package fr.edtuca.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.concurrent.Executors

/**
 * Emploi du temps de toute la classe (ADE, edt.uca.fr), comme dans l'extension : l'export iCalendar d'ADE ne demande aucun
 * cookie ; seule son adresse (numéros de ressources de la classe) se découvre une fois, avec la session de l'app : une
 * WebView invisible ouvre la page ADE, clique « Exporter » puis « Générer URL » et lit l'adresse. Elle est gardée, puis chaque
 * synchro relit l'export sans connexion. L'app ne lit ni ne copie aucun cookie.
 */
object ClassSync {
    const val NEED_LOGIN = "Connexion à ADE requise"
    /** ADE refuse d'exporter tant qu'aucune classe n'est sélectionnée dans son arbre : l'utilisateur doit la choisir une fois. */
    const val NEED_PICK = "Choisis ta classe dans ADE"
    const val ADE_CAS = "https://ent.uca.fr/cas/login?service=http%3A%2F%2Fedt.uca.fr%2Fdirect%2Fmyplanning.jsp"
    const val DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    private const val ADE_HOST = "edt.uca.fr"
    private const val ADE_PATH = "/jsp/custom/modules/plannings/anonymous_cal.jsp"
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var running = false

    /** Progression affichée par l'app (halo bleu + carte « en direct ») : pct 0-100, -1 = masquer. */
    @Volatile var progressListener: ((Int, String?) -> Unit)? = null
    /** Vrai seulement quand l'utilisateur vient de demander l'emploi du temps de la classe : les rafraîchissements automatiques restent invisibles. */
    @Volatile var userRequested = false
    fun report(pct: Int, msg: String? = null) {
        if (!userRequested) return
        if (pct < 0 || pct >= 100) userRequested = false
        handler.post { progressListener?.invoke(pct, msg) }
    }

    /** Garde seulement ressources / projet / configuration ; refuse toute autre adresse (même règle que core/ade.js). */
    fun normalize(raw: String?): String? {
        val u = try { android.net.Uri.parse(raw?.trim() ?: return null) } catch (_: Exception) { return null }
        if (u.scheme != "https" || u.host != ADE_HOST || u.path != ADE_PATH) return null
        val resources = u.getQueryParameter("resources") ?: return null
        val project = u.getQueryParameter("projectId") ?: return null
        val cfg = u.getQueryParameter("displayConfigId")
        if (!Regex("\\d+(,\\d+){0,30}").matches(resources) || !Regex("\\d{1,6}").matches(project)) return null
        if (cfg != null && !Regex("\\d{1,6}").matches(cfg)) return null
        return "https://$ADE_HOST$ADE_PATH?resources=$resources&projectId=$project&calType=ical" + (if (cfg != null) "&displayConfigId=$cfg" else "")
    }

    // Exécuté DANS la page ADE (même logique que adePageDiscover de background.js) ; le résultat est lu ensuite dans window.__ucaAde.
    const val DISCOVER_JS = """
        (function () {
          if (window.__ucaAdeStarted) return; window.__ucaAdeStarted = true; window.__ucaAde = null;
          (async function () {
            var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            var until = async function (fn, ms) { var end = Date.now() + ms; while (Date.now() < end) { var v = fn(); if (v) return v; await sleep(250); } return null; };
            var visible = function (e) { return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
            var byText = function (re) { return [].slice.call(document.querySelectorAll('button')).filter(function (b) { return re.test(b.textContent || '') && visible(b); })[0]; };
            var close = async function () { var b = byText(/^(Fermer|Annuler|Ok)${'$'}/i); if (b) { b.click(); await sleep(300); } };
            var noResource = function () { return /sélectionner une ressource/i.test(document.body.innerText || ''); };
            var bar = await until(function () {
              var l = [].slice.call(document.querySelectorAll('table.x-btn.x-btn-icon')).filter(function (t) { var r = t.getBoundingClientRect(); return visible(t) && r.top < 60 && r.left > innerWidth * 0.6; })
                .sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
              return l.length >= 2 ? l : null; }, 25000);
            if (!bar) { window.__ucaAde = { error: 'barre introuvable' }; return; }
            for (var i = 1; i < bar.length; i++) {
              var btn = bar[i].querySelector('button'); if (!btn) continue;
              btn.click();
              var gen = await until(function () { return byText(/Générer URL/i) || (noResource() ? 'x' : null); }, 2500);
              if (gen === 'x') { await close(); window.__ucaAde = { error: 'ressource' }; return; }
              if (!gen) { await close(); continue; }
              gen.click();
              var a = await until(function () { return [].slice.call(document.querySelectorAll('#logdetail a')).filter(function (x) { return /anonymous_cal/.test(x.href); })[0] || (noResource() ? 'x' : null); }, 8000);
              if (a === 'x') { await close(); window.__ucaAde = { error: 'ressource' }; return; }
              var href = a ? a.href : null;
              await close();
              if (href) { window.__ucaAde = { href: href }; return; }
            }
            window.__ucaAde = { error: 'export introuvable' };
          })();
        })();
    """

    /** Le CAS renvoie vers http://edt.uca.fr/… : Android refuse le trafic non chiffré, on passe la même adresse en https. */
    fun upgradeHttp(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
        val u = request.url
        if (u.scheme == "http" && u.host == ADE_HOST) { view.loadUrl(u.buildUpon().scheme("https").build().toString()); return true }
        return false
    }

    private fun pad(n: Int) = n.toString().padStart(2, '0')

    private fun rangeUrl(base: String): String {
        val now = Calendar.getInstance()
        val year = if (now.get(Calendar.MONTH) >= Calendar.SEPTEMBER) now.get(Calendar.YEAR) else now.get(Calendar.YEAR) - 1
        val last = Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, 150) }
        val lastDate = "${last.get(Calendar.YEAR)}-${pad(last.get(Calendar.MONTH) + 1)}-${pad(last.get(Calendar.DAY_OF_MONTH))}"
        return "$base&firstDate=$year-09-01&lastDate=$lastDate"
    }

    /** Télécharge l'export iCalendar (sans cookie) ; [onDone] rappelé sur le thread principal avec le texte ou une erreur. */
    private fun download(base: String, onDone: (text: String?, error: String?) -> Unit) {
        report(85, "Téléchargement de l'emploi du temps de la classe…")
        io.execute {
            var text: String? = null
            var error: String? = null
            try {
                val conn = (URL(rangeUrl(base)).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10000; readTimeout = 30000
                    setRequestProperty("User-Agent", "MyUCA-App"); setRequestProperty("Cache-Control", "no-cache")
                }
                if (conn.responseCode !in 200..299) error = "ADE a répondu ${conn.responseCode}"
                else {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    if (body.length > 6_000_000) error = "Réponse ADE trop grande"
                    else if (!body.contains("BEGIN:VCALENDAR")) error = "Réponse ADE inattendue"
                    else text = body
                }
            } catch (e: Exception) { error = "ADE injoignable" }
            if (text != null) report(100, "Emploi du temps de la classe récupéré") else report(-1)
            handler.post { onDone(text, error) }
        }
    }

    /**
     * Relit l'export de la classe. Sans adresse enregistrée, [discover] = true ouvre ADE avec la session de l'app pour la trouver
     * (sinon on ne tente rien). [onResult] : (texte iCalendar, null) ou (null, message d'erreur) ; (null, null) = rien à faire.
     */
    fun run(context: Context, discover: Boolean, onResult: (text: String?, error: String?) -> Unit) {
        val ctx = context.applicationContext
        if (running) { onResult(null, null); return }   // une récupération est déjà en cours : elle pilote l'affichage
        if (!PrefsStore.isLoggedIn(ctx) || PrefsStore.qaDemo(ctx)) { report(-1); onResult(null, null); return }
        val known = normalize(PrefsStore.adeUrl(ctx))
        if (known != null) {
            running = true
            report(20, "Lecture de l'export ADE…")
            download(known) { text, error -> running = false; onResult(text, error) }
            return
        }
        if (!discover || PrefsStore.sessionExpired(ctx)) { report(-1); onResult(null, if (discover)"Session expirée : reconnecte-toi puis réessaie." else null); return }
        running = true
        report(5, "Ouverture d'ADE avec ta session…")
        val web = WebView(ctx)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        // ADE détecte le mobile : on se présente comme un navigateur de bureau, avec une vraie taille d'écran (la barre d'outils
        // d'ADE est cherchée en haut à droite de la page ; sans dimensions la WebView invisible ne la dessine pas).
        web.settings.userAgentString = DESKTOP_UA
        web.settings.useWideViewPort = true
        web.settings.loadWithOverviewMode = true
        web.measure(android.view.View.MeasureSpec.makeMeasureSpec(1400, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(900, android.view.View.MeasureSpec.EXACTLY))
        web.layout(0, 0, 1400, 900)
        var finished = false
        val finish = { text: String?, error: String? ->
            if (!finished) {
                finished = true; running = false
                handler.removeCallbacksAndMessages(web); handler.post { web.destroy() }
                report(-1)
                onResult(text, error)
            }
        }
        fun poll(tries: Int) {
            if (finished) return
            web.evaluateJavascript("(function(){return window.__ucaAde ? JSON.stringify(window.__ucaAde) : '';})()") { raw ->
                val s = try { JSONObject("{\"v\":$raw}").getString("v") } catch (_: Exception) { "" }
                if (s.isNotEmpty()) {
                    val res = try { JSONObject(s) } catch (_: Exception) { null }
                    val url = normalize(res?.optString("href"))
                    if (url == null) finish(null, if (res?.optString("error") == "ressource") NEED_PICK else (res?.optString("error")?.ifBlank { null } ?: "Adresse de l'emploi du temps de la classe introuvable"))
                    else {
                        PrefsStore.setAdeUrl(ctx, url)
                        report(75, "Adresse de la classe trouvée")
                        running = false
                        finished = true
                        handler.removeCallbacksAndMessages(web); handler.post { web.destroy() }
                        running = true
                        download(url) { text, error -> running = false; onResult(text, error) }
                    }
                } else if (tries <= 1) finish(null, "Emploi du temps de la classe : délai dépassé")
                else { report(20 + (45 - tries) * 45 / 45, "Recherche de l'export iCalendar dans ADE…"); handler.postDelayed({ poll(tries - 1) }, 1000) }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest) = upgradeHttp(view, request)
            override fun onPageFinished(view: WebView, url: String?) {
                val u = android.net.Uri.parse(url ?: return)
                if (u.host == "ent.uca.fr") {
                    // Formulaire de connexion affiché : la session de l'app ne couvre pas ADE ; on n'insiste pas.
                    view.evaluateJavascript("(function(){return !!document.querySelector('input[type=password]');})()") { r -> if (r == "true") finish(null, NEED_LOGIN) }
                } else if (u.host == ADE_HOST && (u.path ?: "").contains("myplanning")) {
                    report(20, "Page ADE chargée…")
                    view.evaluateJavascript(DISCOVER_JS, null)
                    handler.postDelayed({ poll(45) }, 1500)
                }
            }
        }
        handler.postAtTime({ finish(null, "Emploi du temps de la classe : délai dépassé") }, web, android.os.SystemClock.uptimeMillis() + 70000)
        web.loadUrl(ADE_CAS)
    }
}
