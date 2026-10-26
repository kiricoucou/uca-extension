package fr.edtuca.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * Récupération de l'emploi du temps Odin en arrière-plan, dans une WebView
 * invisible. Portage direct de la logique de uca-extension/background.js :
 * mêmes URLs, même regex de détection, même stratégie de retry (la page
 * Odin affiche d'abord l'accueil puis remplace le contenu en AJAX).
 */
object UcaSync {
    const val EDT_URL = "https://odin.iut.uca.fr/etudiants/?p=edt"
    const val CAS_URL = "https://ent.uca.fr/cas/login?service=" +
        "https%3A%2F%2Fodin.iut.uca.fr%2Fportail%2F"
    const val NOTES_URL = "https://odin.iut.uca.fr/etudiants/?p=notes"
    const val ABSENCES_URL = "https://odin.iut.uca.fr/etudiants/?p=absences"
    // Messagerie Zimbra : service CAS différent d'Odin, mais même CAS (ent.uca.fr) donc
    // SSO — si la session CAS est encore valide (déjà connecté pour l'Agenda), ce login
    // passe sans re-demander identifiants/2FA. Confirmé en vrai (URL donnée par l'utilisateur).
    const val MAIL_CAS_URL = "https://ent.uca.fr/cas/login?service=" +
        "https%3A%2F%2Fmail.uca.fr%2Fzimbra%2Fpublic%2Fpreauthuca.jsp"
    const val MAIL_HOST = "mail.uca.fr"
    const val MAIL_URL = "https://mail.uca.fr/zimbra/mail"

    private val DATE_HEADER_RE = Regex(
        "\\d{1,2}\\s*(janvier|f[ée]vrier|fevrier|mars|avril|mai|juin|juillet|ao[uû]t|aout|" +
            "septembre|octobre|novembre|d[ée]cembre|decembre|janv?|f[ée]vr?|avr|juil?|sept?|oct|nov|d[ée]c)\\.?|" +
            "\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|" +
            "(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+\\d{1,2}|" +
            "\\d{1,2}[:h]\\d{2}\\s*-\\s*\\d{1,2}[:h]\\d{2}",
        RegexOption.IGNORE_CASE
    )

    private val ABSENCE_LINE_RE = Regex(
        "Nombre d['’]absences?\\s*([a-zàéèâîôûäëïöüÿç]+(?:\\s[a-zàéèâîôûäëïöüÿç]+)*)\\s*:\\s*(\\d+)",
        RegexOption.IGNORE_CASE
    )

    private const val EXTRACT_JS = """
        (function() {
            function getDocText(doc) {
                if (!doc) return '';
                var res = doc.body ? doc.body.innerText : '';
                var frames = doc.querySelectorAll('iframe, frame');
                for (var i = 0; i < frames.length; i++) {
                    try {
                        var fdoc = frames[i].contentDocument || (frames[i].contentWindow && frames[i].contentWindow.document);
                        if (fdoc) res += '\n' + getDocText(fdoc);
                    } catch(e) {}
                }
                return res;
            }
            return getDocText(document);
        })()
    """

    // Format réel confirmé (tableau hiérarchique UE > matière > évaluation, colonnes
    // Coeff/Note/Moy/Maxi/Mini) — voir parseNotesText / background.js pour le détail.
    private val UE_RE = Regex("^UE\\s")
    private val MATIERE_RE = Regex("^(R|SAE)\\d+(\\.\\d+)*\\s*:")
    private val EVAL_RE = Regex("\\(sur\\s*[\\d.,]+\\)", RegexOption.IGNORE_CASE)

    private val handler = Handler(Looper.getMainLooper())

    /**
     * Ouvre une WebView cachée sur EDT_URL, attend le chargement AJAX réel
     * (jusqu'à 60 tentatives / 1s, comme navigateAndScrape côté extension),
     * puis renvoie le texte complet de la page ou null si la session a
     * expiré (redirection vers ent.uca.fr).
     */
    private fun isHost(url: String?, host: String): Boolean =
        url != null && android.net.Uri.parse(url).host == host

    /** Configure les cookies et UA d'une WebView invisible pour garantir la persistance de session */
    private fun setupHiddenWebView(hidden: WebView) {
        hidden.settings.javaScriptEnabled = true
        hidden.settings.domStorageEnabled = true
        hidden.settings.databaseEnabled = true
        android.webkit.CookieManager.getInstance().setAcceptCookie(true)
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(hidden, true)
        val ua = hidden.settings.userAgentString
        if (ua != null) {
            hidden.settings.userAgentString = ua.replace("; wv", "")
        }
    }

    /** onPageFinished peut tomber plusieurs fois : un seul polling, un seul résultat, puis destroy(). */
    fun resync(context: Context, onResult: (text: String?, sessionExpired: Boolean) -> Unit) {
        val hidden = WebView(context)
        setupHiddenWebView(hidden)
        var started = false
        var done = false
        val finish: (String?, Boolean) -> Unit = { text, expired ->
            if (!done) {
                done = true
                onResult(text, expired)
                handler.post { hidden.destroy() }
            }
        }

        hidden.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (isHost(url, "ent.uca.fr")) {
                    finish(null, true)
                    return
                }
                if (started) return
                started = true
                pollForSchedule(hidden, tries = 60, delayMs = 1000, onResult = finish)
            }
        }
        hidden.loadUrl(EDT_URL)
    }

    fun containsSchedule(text: String): Boolean = DATE_HEADER_RE.containsMatchIn(text)

    fun extractProfile(context: Context, text: String) {
        try {
            val nameMatch = Regex("(?:Bonjour|Bienvenue|Étudiant|Etudiant|Utilisateur)\\s*[:,-]?\\s*([A-ZÀ-ÖØ-ß][a-zà-öø-ÿ\\-]+(?:\\s+[A-ZÀ-ÖØ-ß][a-zà-öø-ÿ\\-]+)+)", RegexOption.IGNORE_CASE).find(text)
                ?: Regex("([A-ZÀ-ÖØ-ß]{2,}\\s+[A-ZÀ-ÖØ-ß][a-zà-öø-ÿ\\-]+)").find(text)
            val studentName = nameMatch?.groupValues?.get(1)?.trim()

            val idMatch = Regex("(?:N°|Numéro|No)\\s*(?:étudiant|etudiant)?\\s*[:\\s]*(\\d{6,10})", RegexOption.IGNORE_CASE).find(text)
                ?: Regex("INE\\s*[:\\s]*([0-9A-Z]{9,12})", RegexOption.IGNORE_CASE).find(text)
            val studentId = idMatch?.groupValues?.get(1)?.trim()

            val grpMatch = Regex("(?:Groupe|Gpe)\\s*[:\\s]*([A-Za-z0-9\\-_ ]{2,20})", RegexOption.IGNORE_CASE).find(text)
            val studentGroup = grpMatch?.groupValues?.get(1)?.trim()

            val emailMatch = Regex("([a-zA-Z0-9._%+-]+@(?:etu\\.)?uca\\.fr)", RegexOption.IGNORE_CASE).find(text)
            var studentEmail = emailMatch?.groupValues?.get(1)?.trim()

            if (studentEmail.isNullOrBlank() && !studentName.isNullOrBlank()) {
                val parts = studentName.lowercase().split(Regex("\\s+"))
                if (parts.size >= 2) {
                    studentEmail = "${parts[0]}.${parts[1]}@etu.uca.fr"
                }
            }

            if (!studentName.isNullOrBlank() || !studentId.isNullOrBlank() || !studentGroup.isNullOrBlank()) {
                PrefsStore.setStudentProfile(
                    context = context,
                    name = studentName,
                    id = studentId,
                    email = studentEmail,
                    group = studentGroup
                )
            }
        } catch (_: Exception) {}
    }

    private fun pollForSchedule(
        webView: WebView,
        tries: Int,
        delayMs: Long,
        onResult: (String?, Boolean) -> Unit
    ) {
        webView.evaluateJavascript(EXTRACT_JS) { raw ->
            val text = unquoteJs(raw)
            if (text.contains("maintenance", ignoreCase = true) || text.contains("indisponible", ignoreCase = true) || text.contains("travaux", ignoreCase = true)) {
                onResult("MAINTENANCE_ERROR", false)
                return@evaluateJavascript
            }
            extractProfile(webView.context, text)
            if (DATE_HEADER_RE.containsMatchIn(text) || tries <= 1) {
                onResult(text, false)
                return@evaluateJavascript
            }
            handler.postDelayed({ pollForSchedule(webView, tries - 1, delayMs, onResult) }, delayMs)
        }
    }

    /**
     * Récupération des absences sur ABSENCES_URL.
     */
    fun scrapeAbsences(context: Context, onResult: (JSONObject?) -> Unit) {
        val hidden = WebView(context)
        setupHiddenWebView(hidden)
        var started = false
        var done = false
        val finish: (JSONObject?) -> Unit = { abs ->
            if (!done) {
                done = true
                onResult(abs)
                handler.post { hidden.destroy() }
            }
        }

        hidden.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (isHost(url, "ent.uca.fr")) {
                    finish(null)
                    return
                }
                if (started) return
                started = true
                pollForAbsences(hidden, tries = 25, delayMs = 600, onResult = finish)
            }
        }
        hidden.loadUrl(ABSENCES_URL)
    }

    private fun pollForAbsences(webView: WebView, tries: Int, delayMs: Long, onResult: (JSONObject?) -> Unit) {
        webView.evaluateJavascript(EXTRACT_JS) { raw ->
            val text = unquoteJs(raw)
            extractProfile(webView.context, text)
            if (text.contains("absence", ignoreCase = true) || tries <= 1) {
                onResult(parseAbsencesText(text))
                return@evaluateJavascript
            }
            handler.postDelayed({ pollForAbsences(webView, tries - 1, delayMs, onResult) }, delayMs)
        }
    }

    private fun parseAbsencesText(text: String): JSONObject {
        val out = JSONObject()
        var declarees: Int? = null
        var justifiees: Int? = null
        var nonJustifiees: Int? = null
        var avecMotifs: Int? = null
        var journeesNJ: Int? = null

        for (match in ABSENCE_LINE_RE.findAll(text)) {
            val label = match.groupValues[1].lowercase()
            val n = match.groupValues[2].toIntOrNull() ?: continue
            when {
                label.contains("déclar") || label.contains("declar") -> declarees = n
                label.contains("non justifi") && label.contains("journ") -> journeesNJ = n
                label.contains("non justifi") -> nonJustifiees = n
                label.contains("avec motif") -> avecMotifs = n
                label.contains("justifi") -> justifiees = n
            }
        }
        out.put("declarees", declarees ?: 0)
        out.put("justifiees", justifiees ?: 0)
        out.put("nonJustifiees", nonJustifiees ?: 0)
        out.put("avecMotifs", avecMotifs ?: 0)
        out.put("journeesNonJustifiees", journeesNJ ?: 0)
        return out
    }

    /** evaluateJavascript renvoie une chaîne JSON-encodée (avec guillemets) côté Android. */
    private fun unquoteJs(raw: String?): String {
        if (raw == null || raw == "null") return ""
        return try {
            JSONObject("{\"v\":$raw}").getString("v")
        } catch (e: Exception) {
            raw
        }
    }

    /**
     * Relevé de notes, même esprit que resync() mais sur NOTES_URL. Renvoie null
     * si la session a expiré ou si la page n'a pas fini de charger le tableau
     * (en-têtes "Coeff"/"Maxi" absents).
     */
    fun scrapeNotes(context: android.content.Context, onResult: (releve: JSONObject?) -> Unit) {
        val hidden = WebView(context)
        setupHiddenWebView(hidden)
        var started = false
        var done = false
        val finish: (JSONObject?) -> Unit = { releve ->
            if (!done) {
                done = true
                onResult(releve)
                handler.post { hidden.destroy() }
            }
        }

        hidden.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (isHost(url, "ent.uca.fr")) {
                    finish(null)
                    return
                }
                if (started) return
                started = true
                pollForNotes(hidden, tries = 25, delayMs = 600, onResult = finish)
            }
        }
        hidden.loadUrl(NOTES_URL)
    }

    private fun pollForNotes(webView: WebView, tries: Int, delayMs: Long, onResult: (JSONObject?) -> Unit) {
        webView.evaluateJavascript(EXTRACT_JS) { raw ->
            val text = unquoteJs(raw)
            extractProfile(webView.context, text)
            if ((text.contains("Coeff") && text.contains("Maxi")) || tries <= 1) {
                onResult(parseNotesText(text))
                return@evaluateJavascript
            }
            handler.postDelayed({ pollForNotes(webView, tries - 1, delayMs, onResult) }, delayMs)
        }
    }

    private fun cleanNoteNum(v: String?): Double? {
        if (v == null) return null
        val t = v.trim()
        if (t.isEmpty() || t == "-") return null
        return t.replace(",", ".").toDoubleOrNull()
    }

    /**
     * Port Kotlin de parseNotesText (extension/background.js) : même format réel confirmé.
     * Une même matière (R1.01, SAE1.02...) peut apparaître sous plusieurs UE à la fois
     * (elle compte pour le coefficient de chacune) — Odin répète alors la ligne telle
     * quelle. On ne veut l'afficher qu'une fois : dédup par titre exact, première
     * occurrence gardée, les évaluations des réapparitions suivantes lui sont rattachées.
     */
    private fun parseNotesText(text: String): JSONObject? {
        val ues = org.json.JSONArray()
        val ueByLabel = HashMap<String, JSONObject>()
        val matiereByLabel = HashMap<String, JSONObject>()
        val matiereEvalsByLabel = HashMap<String, org.json.JSONArray>()
        val seenEvalsByMatiere = HashMap<String, MutableSet<String>>()
        var currentUE: JSONObject? = null
        var currentMatiereLabel: String? = null

        for (raw in text.split(Regex("\r?\n"))) {
            if (raw.isBlank()) continue
            val cols = raw.trim().split(Regex("\t| {2,}"))
            val label = cols.getOrNull(0)?.trim().orEmpty()
            if (label.isEmpty() || cols.size < 2) continue
            val coeff = cleanNoteNum(cols.getOrNull(1))
            val note = cleanNoteNum(cols.getOrNull(2))
            val moy = cleanNoteNum(cols.getOrNull(3))
            val maxi = cleanNoteNum(cols.getOrNull(4))
            val mini = cleanNoteNum(cols.getOrNull(5))
            fun rowOf() = JSONObject().apply {
                put("label", label.take(200))
                put("coeff", coeff); put("note", note); put("moy", moy); put("maxi", maxi); put("mini", mini)
            }
            when {
                UE_RE.containsMatchIn(label) -> {
                    currentUE = ueByLabel.getOrPut(label) {
                        val matieres = org.json.JSONArray()
                        rowOf().apply { put("matieres", matieres) }.also { ues.put(it) }
                    }
                    currentMatiereLabel = null
                }
                MATIERE_RE.containsMatchIn(label) -> {
                    currentMatiereLabel = label
                    if (!matiereByLabel.containsKey(label)) {
                        val evals = org.json.JSONArray()
                        matiereEvalsByLabel[label] = evals
                        seenEvalsByMatiere[label] = mutableSetOf()
                        val matiere = rowOf().apply { put("evals", evals) }
                        matiereByLabel[label] = matiere
                        currentUE?.getJSONArray("matieres")?.put(matiere)
                    }
                }
                currentMatiereLabel != null && EVAL_RE.containsMatchIn(label) -> {
                    val seen = seenEvalsByMatiere.getValue(currentMatiereLabel!!)
                    if (seen.add(label)) {
                        matiereEvalsByLabel.getValue(currentMatiereLabel!!).put(rowOf())
                    }
                }
            }
        }
        if (ues.length() == 0) return null
        return JSONObject().apply { put("ue", ues) }
    }
}
