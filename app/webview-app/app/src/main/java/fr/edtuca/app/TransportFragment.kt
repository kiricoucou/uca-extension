package fr.edtuca.app

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
 * Écran Transports & Mobilité UCA :
 * Embarque le moteur multimodal complet (T2C, SNCF TER, BlaBlaCar, FlixBus)
 * chargé depuis les assets locaux sécurisés via WebViewAssetLoader.
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

            override fun onPageFinished(view: WebView?, url: String?) {
                loading.visibility = View.GONE
            }
        }

        webView.loadUrl("https://appassets.androidplatform.net/assets/legacy-site/transport.html")

        return root
    }
}
