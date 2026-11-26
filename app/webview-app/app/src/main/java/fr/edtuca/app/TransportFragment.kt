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
import java.io.ByteArrayInputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Écran Transports : prochains passages T2C (bus, tram) et liens vers les sites officiels (train, covoiturage, cars).
 * La page vient des assets locaux (WebViewAssetLoader). Le serveur T2C n'autorise pas les appels depuis une page web
 * (CORS) : la seule adresse des départs d'un arrêt est donc lue ici, côté Android, sans cookie ni donnée personnelle.
 * Tous les autres liens s'ouvrent dans le navigateur du téléphone.
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
                if (request.method == "GET" && isDeparturesUrl(request.url)) return fetchDepartures(request.url)
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

    /** Uniquement https://api.t2c.fr/siv/stops/<code>/departures?dateTime=… : rien d'autre n'est relayé. */
    private fun isDeparturesUrl(url: Uri): Boolean =
        url.scheme == "https" && url.host == "api.t2c.fr" && url.port == -1 &&
            DEPARTURES_PATH.matches(url.encodedPath ?: "") && url.queryParameterNames == setOf("dateTime")

    /** Appelé hors du fil d'interface. Une panne renvoie une erreur 502 : la page affiche alors « Indisponible ». */
    private fun fetchDepartures(url: Uri): WebResourceResponse {
        val headers = mapOf("Access-Control-Allow-Origin" to "https://appassets.androidplatform.net", "Cache-Control" to "no-store")
        var connection: HttpURLConnection? = null
        return try {
            connection = URL(url.toString()).openConnection() as HttpURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode != 200) throw IOException("HTTP " + connection.responseCode)
            val body = connection.inputStream.use { it.readBytes() }
            if (body.size > MAX_BODY) throw IOException("réponse trop grosse")
            WebResourceResponse("application/json", "utf-8", 200, "OK", headers, ByteArrayInputStream(body))
        } catch (_: Exception) {
            WebResourceResponse("application/json", "utf-8", 502, "Bad Gateway", headers, ByteArrayInputStream("[]".toByteArray()))
        } finally {
            connection?.disconnect()
        }
    }

    private companion object {
        val DEPARTURES_PATH = Regex("^/siv/stops/[A-Za-z0-9_-]{1,40}/departures$")
        const val MAX_BODY = 2_000_000
    }
}
