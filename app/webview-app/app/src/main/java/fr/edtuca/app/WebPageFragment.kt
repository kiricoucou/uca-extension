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

/** Ouvre une page d'Odin ou du CAS dans l'app, avec la session de l'app (si elle a expiré, la page de connexion officielle s'affiche). */
class WebPageFragment : Fragment() {
    companion object {
        fun of(url: String, title: String) = WebPageFragment().apply { arguments = Bundle().apply { putString("url", url); putString("title", title) } }
        private val HOSTS = setOf("odin.iut.uca.fr", "ent.uca.fr")
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val root = inflater.inflate(R.layout.fragment_mail, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = arguments?.getString("title") ?: "Odin"
        root.findViewById<View>(R.id.backBtn).visibility = View.VISIBLE
        root.findViewById<View>(R.id.backBtn).setOnClickListener { requireActivity().supportFragmentManager.popBackStack() }
        val web = root.findViewById<WebView>(R.id.webView)
        val loading = root.findViewById<ProgressBar>(R.id.loading)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        CookieManager.getInstance().setAcceptCookie(true)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "https" && request.url.host in HOSTS) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }
            override fun onPageFinished(view: WebView, url: String?) { loading.visibility = View.GONE }
        }
        val url = arguments?.getString("url") ?: return root
        if (android.net.Uri.parse(url).host in HOSTS) web.loadUrl(url)
        return root
    }
}
