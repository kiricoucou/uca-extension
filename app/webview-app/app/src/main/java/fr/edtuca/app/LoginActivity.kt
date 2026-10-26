package fr.edtuca.app

import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Écran de connexion CAS (ent.uca.fr) + 2FA Trustbuilder Inwebo.
 * Affiche un bandeau d'instruction sécurisé clair pour le 2FA et flashe
 * immédiatement les cookies de session pour une synchronisation complète en 1 coup.
 */
class LoginActivity : Activity() {
    companion object {
        const val EXTRA_CAS_URL = "cas_url"
        const val EXTRA_SUCCESS_HOST = "success_host"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isFinishingLogin = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val casUrl = intent.getStringExtra(EXTRA_CAS_URL) ?: UcaSync.CAS_URL
        val successHost = intent.getStringExtra(EXTRA_SUCCESS_HOST) ?: "odin.iut.uca.fr"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#121418"))
        }

        // Bandeau de sécurité et instruction 2FA
        val infoBanner = TextView(this).apply {
            text = "🔒 Connexion sécurisée CAS UCA · Veuillez saisir vos identifiants ENT et valider la double authentification 2FA (Trustbuilder) si demandé."
            setTextColor(Color.parseColor("#00BFA5"))
            setBackgroundColor(Color.parseColor("#1A2E2C"))
            textSize = 12.5f
            setPadding(32, 24, 32, 24)
            gravity = Gravity.CENTER
        }
        root.addView(infoBanner)

        val webView = WebView(this)
        root.addView(webView, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.MATCH_PARENT
        ))
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (isFinishingLogin) return
                val u = Uri.parse(url ?: return)
                if (u.scheme == "https" && u.host == successHost) {
                    isFinishingLogin = true
                    // Flusher les cookies vers le disque avant de terminer
                    CookieManager.getInstance().flush()
                    handler.postDelayed({
                        setResult(RESULT_OK)
                        finish()
                    }, 500)
                }
            }
        }

        webView.loadUrl(casUrl)
    }
}
