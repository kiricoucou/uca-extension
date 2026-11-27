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
        /** Moodle sert aussi sa page de connexion : elle ne compte pas comme une connexion réussie. */
        const val EXTRA_SKIP_LOGIN_PAGES = "skip_login_pages"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isFinishingLogin = false

    /**
     * Connexion unique : Odin et Moodle passent par le même CAS de l'université. Dès que la connexion demandée a réussi,
     * la même fenêtre ouvre l'autre site : le CAS (encore tout neuf) le laisse entrer sans rien redemander. Aucun
     * identifiant n'est lu ni enregistré. Si le CAS redemande quand même une saisie, on n'insiste pas : la première
     * connexion reste réussie.
     */
    private class Companion2(val url: String, val host: String, val name: String)
    private var second: Companion2? = null
    private var secondStarted = false

    private fun companionOf(successHost: String): Companion2? = when {
        successHost == Uri.parse(UcaSync.EDT_URL).host -> Companion2(UcaMoodle.loginUrl(), Uri.parse(UcaMoodle.loginUrl()).host.orEmpty(), "Moodle")
        successHost.startsWith("moodle") -> Companion2(UcaSync.CAS_URL, Uri.parse(UcaSync.EDT_URL).host.orEmpty(), "Odin")
        else -> null
    }

    private fun done(secondOpened: Boolean?) {
        if (isFinishingLogin) return
        isFinishingLogin = true
        handler.removeCallbacksAndMessages(null)
        second?.let { c ->
            if (secondOpened != null) SessionDiag.log(this, "connexion unique : " + c.name + if (secondOpened) " ouvert sans nouvelle saisie" else " non ouvert (le CAS a redemandé une saisie ou n'a pas répondu)")
        }
        // Flusher les cookies vers le disque avant de terminer
        CookieManager.getInstance().flush()
        handler.postDelayed({
            setResult(RESULT_OK)
            finish()
        }, 500)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val casUrl = intent.getStringExtra(EXTRA_CAS_URL) ?: UcaSync.CAS_URL
        val successHost = intent.getStringExtra(EXTRA_SUCCESS_HOST) ?: "odin.iut.uca.fr"

        val skipLoginPages = intent.getBooleanExtra(EXTRA_SKIP_LOGIN_PAGES, false)

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
        // Même identité de navigateur que les lectures en arrière-plan (UcaSync, UcaMoodle) : un CAS peut lier sa session
        // à cette identité et refuser ensuite les pages ouvertes avec une autre.
        webView.settings.userAgentString = webView.settings.userAgentString.replace("; wv", "")
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                if (isFinishingLogin) return
                val u = Uri.parse(url ?: return)
                val loginPage = skipLoginPages && Regex("/login/|/cas/", RegexOption.IGNORE_CASE).containsMatchIn(u.path.orEmpty())
                val other = second
                if (secondStarted && other != null) {
                    val arrived = u.scheme == "https" && u.host == other.host && !Regex("/login/|/cas/", RegexOption.IGNORE_CASE).containsMatchIn(u.path.orEmpty())
                    if (arrived) done(true)
                    return
                }
                if (u.scheme == "https" && u.host == successHost && !loginPage) {
                    CookieManager.getInstance().flush()
                    val next = companionOf(successHost)
                    if (next == null) { done(null); return }
                    second = next
                    secondStarted = true
                    infoBanner.text = "✓ Connecté. Ouverture de " + next.name + " avec la même connexion…"
                    // La première connexion a réussi : quoi qu'il arrive, on ne retient pas l'utilisateur plus de 12 s.
                    handler.postDelayed({ done(false) }, 12_000)
                    handler.postDelayed({ view.loadUrl(next.url) }, 400)
                }
            }
        }

        webView.loadUrl(casUrl)
    }

    /** Fenêtre fermée pendant l'ouverture du second site : la première connexion était déjà réussie. */
    override fun onBackPressed() {
        if (secondStarted && !isFinishingLogin) { done(false); return }
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
