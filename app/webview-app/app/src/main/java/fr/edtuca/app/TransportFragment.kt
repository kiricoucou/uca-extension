package fr.edtuca.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.webkit.WebViewAssetLoader

/**
 * Écran Transports : prochains passages T2C (bus, tram) et liens vers les sites officiels (train, covoiturage, cars).
 * La page vient des assets locaux (WebViewAssetLoader) et lit les données ouvertes officielles de T2C.
 * Les liens s'ouvrent dans le navigateur du téléphone.
 */
class TransportFragment : Fragment() {

    private lateinit var webView: WebView
    private lateinit var loading: ProgressBar

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_transport, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Transports & Mobilité"

        val backBtn = root.findViewById<View>(R.id.backBtn)
        backBtn.visibility = View.VISIBLE
        backBtn.setOnClickListener {
            requireActivity().supportFragmentManager.popBackStack()
        }

        webView = root.findViewById(R.id.webView)
        loading = root.findViewById(R.id.loading)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.useWideViewPort = true
        webView.settings.loadWithOverviewMode = true

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(requireContext()))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                if (url.scheme == "https") {
                    try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: ActivityNotFoundException) { }
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                loading.visibility = View.GONE
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/legacy-site/transport.html")

        return root
    }
}
