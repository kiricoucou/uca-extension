package fr.edtuca.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * Lit la fiche de l'étudiant dans Odin avec la session de l'app (cookies de la WebView, jamais lus ni copiés).
 * Seules des lignes « Étiquette : valeur » explicites sont retenues (Nom, Prénom, Date de naissance, N° étudiant,
 * Formation, Groupe, Email @etu.uca.fr) : jamais un nom deviné dans le texte, qui pourrait être celui d'un enseignant.
 */
object ProfileSync {
    const val ODIN_HOME = "https://odin.iut.uca.fr/etudiants/"
    private val handler = Handler(Looper.getMainLooper())
    private const val EXTRACT = "(function(){var t=document.body?document.body.innerText:'';var a=[].slice.call(document.querySelectorAll('a')).filter(function(x){return /profil|informations? personnelles?|fiche|dossier|mon compte/i.test(x.textContent||'')&&x.href;}).map(function(x){return x.href;});var s=[].slice.call(document.querySelectorAll('select')).map(function(x){var o=x.options[x.selectedIndex];return o?(o.text||'').trim():'';}).filter(function(v){return /BUT|DUT|Licence|Master|ann[ée]e/i.test(v);});return JSON.stringify({t:t,a:a,s:s});})()"
    @Volatile private var running = false

    private fun field(text: String, label: String): String? =
        Regex("(?:^|\\n)\\s*" + label + "\\s*:?[ \\t]*\\n?[ \\t]*([^\\n:]{2,60})(?:\\n|$)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.trim()

    /** Retient les champs trouvés dans [text] ; renvoie true si au moins un champ a été reconnu. */
    fun parse(ctx: Context, text: String): Boolean {
        // Sur la fiche d'Odin le nom est une ligne sans étiquette, « NOM Prénom », juste avant « Adresse mail ».
        val nameLine = Regex("(?:^|\\n)[ \\t]*([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ'\\- ]{0,30}[A-ZÀ-ÖØ-Þ])[ \\t]+([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'\\-]+(?:[ \\-][A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'\\-]+)?)[ \\t]*\\n+[ \\t]*Adresse mail").find(text)
        val nom = field(text, "Nom(?: de famille| usuel)?") ?: nameLine?.groupValues?.get(1)?.trim()
        val prenom = field(text, "Pr[ée]nom") ?: nameLine?.groupValues?.get(2)?.trim()
        val full = if (!nom.isNullOrBlank() && !prenom.isNullOrBlank()) nom.uppercase() + " " + prenom else null
        val birth = field(text, "(?:Date de naissance|N[ée](?:\\(e\\))? le)")?.takeIf { Regex("\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}").containsMatchIn(it) }
        val id = Regex("(?:N°\\s*(?:d['’])?[ée]tudiant|Num[ée]ro\\s*[ée]tudiant)\\s*:?\\s*(\\d{6,10})", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
        val formation = field(text, "(?:Formation|Parcours|Dipl[ôo]me)")
        val group = field(text, "Groupe")
        val email = Regex("([A-Za-z0-9._%+-]+@etu\\.uca\\.fr)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.lowercase()
        if (full == null && birth == null && id == null && formation == null && group == null && email == null) return false
        PrefsStore.setStudentProfile(ctx, name = full, id = id, email = email, formation = formation, birth = birth, group = group)
        return true
    }

    /** À appeler depuis le thread principal. Sans effet si la session est expirée. */
    fun run(context: Context, onDone: (() -> Unit)? = null) {
        val ctx = context.applicationContext
        if (running || !PrefsStore.isLoggedIn(ctx) || PrefsStore.sessionExpired(ctx) || PrefsStore.qaDemo(ctx)) { onDone?.invoke(); return }
        running = true
        val web = WebView(ctx)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        web.settings.userAgentString = web.settings.userAgentString?.replace("; wv", "")
        var finished = false
        var visited = 0
        val finish = { if (!finished) { finished = true; running = false; handler.removeCallbacksAndMessages(web); handler.post { web.destroy() }; onDone?.invoke() } }
        fun read(tries: Int) {
            if (finished) return
            web.evaluateJavascript(EXTRACT) { raw ->
                val json = try { JSONObject(JSONObject("{\"v\":" + raw + "}").getString("v")) } catch (_: Exception) { null }
                val sel = json?.optJSONArray("s")
                val text = json?.optString("t").orEmpty() + (if (sel != null && sel.length() > 0) "\nFormation : " + sel.getString(0) else "")
                val found = text.isNotBlank() && parse(ctx, text)
                val links = json?.optJSONArray("a")
                val next = (0 until (links?.length() ?: 0)).map { links!!.getString(it) }.firstOrNull { android.net.Uri.parse(it).host == "odin.iut.uca.fr" }
                if (!found && visited == 1 && next != null) { visited++; web.loadUrl(next) }   // lien « profil » de la page d'accueil
                else if (found || tries <= 1 || visited >= 2) finish()
                else handler.postDelayed({ read(tries - 1) }, 700)
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                val host = android.net.Uri.parse(url ?: return).host
                if (host == "ent.uca.fr") finish() else if (host == "odin.iut.uca.fr") { if (visited == 0) visited = 1; read(8) }
            }
        }
        handler.postAtTime({ finish() }, web, android.os.SystemClock.uptimeMillis() + 40000)
        web.loadUrl(ODIN_HOME)
    }
}
