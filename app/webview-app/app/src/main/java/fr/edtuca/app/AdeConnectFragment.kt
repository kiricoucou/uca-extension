package fr.edtuca.app

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import org.json.JSONObject

/**
 * Connexion visible à ADE (edt.uca.fr) : la session CAS de l'app ne survit pas toujours à un redémarrage, et la découverte de
 * l'adresse de la classe a besoin d'une session. L'utilisateur tape lui-même ses codes sur la page officielle du CAS ; dès
 * que la page ADE est affichée, l'adresse d'export est lue puis gardée (elle ne contient aucun jeton), et l'écran se ferme.
 */
class AdeConnectFragment : Fragment() {
    companion object { const val RESULT = "ade_connect" }

    private val handler = Handler(Looper.getMainLooper())
    private var web: WebView? = null
    private var started = false
    private var done = false
    private var pickHinted = false

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val root = inflater.inflate(R.layout.fragment_mail, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Connexion à ADE"
        root.findViewById<View>(R.id.backBtn).visibility = View.VISIBLE
        root.findViewById<View>(R.id.backBtn).setOnClickListener { finish(false) }
        ClassSync.userRequested = true   // cet écran ne s'ouvre que sur demande de l'utilisateur
        val view = root.findViewById<WebView>(R.id.webView)
        val loading = root.findViewById<ProgressBar>(R.id.loading)
        web = view
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        CookieManager.getInstance().setAcceptCookie(true)
        // ADE sert une mise en page mobile sans sa barre d'outils : on se présente comme un navigateur de bureau.
        view.settings.userAgentString = ClassSync.DESKTOP_UA
        view.settings.useWideViewPort = true
        view.settings.loadWithOverviewMode = true
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                if (ClassSync.upgradeHttp(v, request)) return true
                val ok = request.url.host in setOf("ent.uca.fr", "edt.uca.fr") && request.url.scheme in setOf("https", "http")
                if (!ok) { try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { } }
                return !ok
            }
            override fun onPageFinished(v: WebView, url: String?) {
                loading.visibility = View.GONE
                CookieManager.getInstance().flush()   // la session CAS doit survivre à un arrêt brutal de l'app
                val u = android.net.Uri.parse(url ?: return)
                if (!started && u.host == "edt.uca.fr" && (u.path ?: "").contains("myplanning")) {
                    started = true
                    ClassSync.report(20, "Page ADE chargée…")
                    Toast.makeText(requireContext(), "Récupération de l'emploi du temps de la classe…", Toast.LENGTH_SHORT).show()
                    v.evaluateJavascript(ClassSync.DISCOVER_JS, null)
                    poll(240)
                }
            }
        }
        view.loadUrl(ClassSync.ADE_CAS)
        return root
    }

    private fun poll(tries: Int) {
        val v = web ?: return
        if (done) return
        v.evaluateJavascript("(function(){return window.__ucaAde ? JSON.stringify(window.__ucaAde) : '';})()") { raw ->
            val s = try { JSONObject("{\"v\":$raw}").getString("v") } catch (_: Exception) { "" }
            if (s.isNotEmpty()) {
                val res = try { JSONObject(s) } catch (_: Exception) { null }
                val url = ClassSync.normalize(res?.optString("href"))
                if (url == null && res?.optString("error") == "ressource" && tries > 1) {
                    // Aucune classe sélectionnée dans ADE : on le dit une fois, puis on réessaie jusqu'à ce que l'utilisateur ait choisi la sienne.
                    if (!pickHinted && isAdded) { pickHinted = true; Toast.makeText(requireContext(), "Choisis ta classe dans la liste d'ADE : l'app lit ensuite le lien toute seule.", Toast.LENGTH_LONG).show() }
                    ClassSync.report(-1)
                    handler.postDelayed({
                        val w = web
                        if (!done && w != null) { w.evaluateJavascript("window.__ucaAdeStarted=false;window.__ucaAde=null;" + ClassSync.DISCOVER_JS, null); poll(tries - 8) }
                    }, 8000)
                    return@evaluateJavascript
                }
                if (url != null && isAdded) { PrefsStore.setAdeUrl(requireContext().applicationContext, url); ClassSync.userRequested = true; ClassSync.report(75, "Adresse de la classe trouvée"); finish(true) }
                else {
                    ClassSync.report(-1)
                    if (isAdded) Toast.makeText(requireContext(), res?.optString("error")?.ifBlank { null } ?: "Adresse de la classe introuvable", Toast.LENGTH_LONG).show()
                    finish(false)
                }
            } else if (tries <= 1) {
                ClassSync.report(-1)
                if (isAdded) Toast.makeText(requireContext(), "ADE ne répond pas, réessaie plus tard.", Toast.LENGTH_LONG).show()
                finish(false)
            } else { ClassSync.report(20 + minOf(45, (240 - tries) * 45 / 240), "Recherche de l'export iCalendar dans ADE…"); handler.postDelayed({ poll(tries - 1) }, 1000) }
        }
    }

    private fun finish(ok: Boolean) {
        if (done) return
        done = true
        if (!ok) ClassSync.report(-1)
        if (!isAdded) return
        parentFragmentManager.setFragmentResult(RESULT, bundleOf("ok" to ok))
        parentFragmentManager.popBackStack()
    }

    override fun onDestroyView() {
        if (!done) ClassSync.report(-1)   // fermé par le bouton retour du système : rien ne doit rester affiché
        done = true
        handler.removeCallbacksAndMessages(null)
        web?.destroy(); web = null
        super.onDestroyView()
    }
}
