package fr.edtuca.app

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment

/**
 * Messagerie = le vrai Zimbra UCA (mail.uca.fr), pas une reconstruction.
 * Zimbra Classic Web Client est une appli complète à lui seul (mail, contacts,
 * calendrier, tâches, préférences — des dizaines d'écrans) ; le reconstruire
 * en composants natifs serait un projet à part entière. Ici on l'embarque tel
 * quel, en passant par le même CAS que l'Agenda (ent.uca.fr) : SSO, donc si
 * l'utilisateur est déjà connecté pour l'Agenda, ça passe sans re-demander
 * identifiants/2FA. Sinon le panel de connexion CAS (+ 2FA) s'affiche
 * directement ici, dans cette même WebView, exactement comme sur le vrai site.
 *
 * Pas de pont JS (`AndroidUCA`) sur cette WebView — contrairement à l'Agenda,
 * elle n'en a pas besoin — donc pas la même raison de verrouiller la
 * navigation à un seul host : elle peut légitimement circuler entre
 * `ent.uca.fr` (CAS) et `mail.uca.fr` (Zimbra).
 *
 * `loadWithOverviewMode`/`useWideViewPort`/`builtInZoomControls` : Zimbra
 * Classic n'est pas un site mobile-friendly (webapp desktop), donc on le
 * charge "dézoomé" avec pincer-zoomer natif plutôt que d'essayer de le
 * forcer en responsive (qu'on ne contrôle pas, contrairement à notre propre
 * site/index.html dans AgendaFragment).
 */
class MailFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_mail, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Messagerie"
        root.findViewById<View>(R.id.backBtn).visibility = View.VISIBLE
        root.findViewById<View>(R.id.backBtn).setOnClickListener {
            requireActivity().supportFragmentManager.popBackStack()
        }

        val webView = root.findViewById<WebView>(R.id.webView)
        val loading = root.findViewById<ProgressBar>(R.id.loading)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.loadWithOverviewMode = true
        webView.settings.useWideViewPort = true
        webView.settings.builtInZoomControls = true
        webView.settings.displayZoomControls = false
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: ""
                // Navigation interne à Zimbra ou au CAS : on reste dans la WebView.
                // Un lien cliqué dans un mail (externe) : navigateur du téléphone.
                if (request.url.scheme == "https" && (host == UcaSync.MAIL_HOST || host == "ent.uca.fr")) {
                    return false
                }
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                loading.visibility = View.GONE
            }
        }

        webView.loadUrl(UcaSync.MAIL_CAS_URL)
        return root
    }
}
