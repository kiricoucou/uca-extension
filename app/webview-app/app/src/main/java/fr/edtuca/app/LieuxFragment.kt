package fr.edtuca.app

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.webkit.WebViewAssetLoader

private data class Lieu(val nom: String, val resto: Boolean, val lat: Double, val lon: Double, val info: String = "")

/** Écran Lieux universitaires : carte (OpenStreetMap ou Google Maps) et liste des campus, avec ouverture dans Google Maps, Waze ou OpenStreetMap. */
class LieuxFragment : Fragment() {

    // Positions relevées dans OpenStreetMap. Aucun horaire ni taux d'affluence : on n'a pas de source fiable pour ça.
    private val lieux = listOf(
        Lieu("BU Sciences des Cézeaux", false, 45.7602, 3.1140, "Campus des Cézeaux · Aubière"),
        Lieu("Restaurant universitaire des Cézeaux", true, 45.7584, 3.1138, "Campus des Cézeaux · Aubière"),
        Lieu("ISIMA", false, 45.7592, 3.1110, "École d'ingénieurs · Cézeaux"),
        Lieu("SIGMA Clermont", false, 45.7578, 3.1129, "École d'ingénieurs · Cézeaux"),
        Lieu("IUT Clermont Auvergne (Aubière)", false, 45.7628, 3.1081, "Site de Rochefeuille · Aubière"),
        Lieu("École de Droit", false, 45.7706, 3.0896, "Cours Raymond Poincaré · Clermont-Ferrand"),
        Lieu("BU Lafayette (Lettres & SHS)", false, 45.7739, 3.0880, "Clermont-Ferrand"),
        Lieu("Faculté de Médecine et de Pharmacie", false, 45.7589, 3.0893, "Clermont-Ferrand"),
        Lieu("Chirurgie dentaire (Odontologie)", false, 45.7865, 3.1120, "Rue de Braga · Saint-Jacques"),
        Lieu("INSPÉ Chamalières", false, 45.7739, 3.0725, "Avenue Pasteur · Chamalières")
    )

    /** Propose Google Maps, Waze ou OpenStreetMap : chaque lien s'ouvre dans l'application correspondante (aucune clé d'API). */
    private fun openPlace(l: Lieu) {
        val ctx = requireContext()
        val options = arrayOf("Google Maps", "Waze", "OpenStreetMap")
        androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setTitle(l.nom)
            .setItems(options) { _, which ->
                val url = when (which) {
                    0 -> "https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=walking"
                    1 -> "https://waze.com/ul?ll=${l.lat},${l.lon}&navigate=yes"
                    else -> "https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=17/${l.lat}/${l.lon}"
                }
                try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
                catch (_: Exception) { android.widget.Toast.makeText(ctx, "Aucune application pour ouvrir ce lien.", android.widget.Toast.LENGTH_SHORT).show() }
            }.setNegativeButton("Annuler", null).show()
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_lieux, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Lieux universitaires"

        val act = requireActivity() as MainActivity
        val prefs = requireContext().getSharedPreferences("uca_maps_consent", Context.MODE_PRIVATE)

        root.findViewById<ImageView>(R.id.topbarBell)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }
        root.findViewById<ImageView>(R.id.topbarPerson)?.setOnClickListener {
            val bottomNav = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
            bottomNav.selectedItemId = R.id.nav_compte
        }

        val consentBox = root.findViewById<LinearLayout>(R.id.cookieConsentBox)
        val mapContainer = root.findViewById<View>(R.id.mapContainer)
        val mapWebView = root.findViewById<WebView>(R.id.mapWebView)
        val btnAccept = root.findViewById<Button>(R.id.btnAcceptCookies)
        val btnRefuse = root.findViewById<Button>(R.id.btnRefuseCookies)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(requireContext()))
            .build()

        mapWebView?.settings?.javaScriptEnabled = true
        mapWebView?.settings?.domStorageEnabled = true
        mapWebView?.settings?.loadWithOverviewMode = true
        mapWebView?.settings?.useWideViewPort = true
        mapWebView?.let { android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(it, true) }
        // Un doigt posé sur la carte la déplace (et deux doigts zooment) au lieu de faire défiler la page.
        mapWebView?.setOnTouchListener { v, ev ->
            if (ev.action == android.view.MotionEvent.ACTION_DOWN || ev.pointerCount > 1) v.parent?.requestDisallowInterceptTouchEvent(true)
            else if (ev.action == android.view.MotionEvent.ACTION_UP || ev.action == android.view.MotionEvent.ACTION_CANCEL) v.parent?.requestDisallowInterceptTouchEvent(false)
            false
        }
        mapWebView?.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            // Un lien cliqué dans la carte (Google Maps, Waze, OpenStreetMap) s'ouvre dans l'application du téléphone.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame || request.url.host == "appassets.androidplatform.net") return false
                try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, request.url)) } catch (_: Exception) { }
                return true
            }
        }

        val loadMap = {
            mapWebView?.loadUrl("https://appassets.androidplatform.net/assets/legacy-site/lieux-map.html")
        }

        val accepted = prefs.getBoolean("accepted", false)
        if (accepted) {
            consentBox.visibility = View.GONE
            mapContainer.visibility = View.VISIBLE
            loadMap()
        } else {
            consentBox.visibility = View.VISIBLE
            mapContainer.visibility = View.GONE
        }

        btnAccept.setOnClickListener {
            prefs.edit().putBoolean("accepted", true).apply()
            consentBox.visibility = View.GONE
            mapContainer.visibility = View.VISIBLE
            loadMap()
        }

        btnRefuse.setOnClickListener {
            prefs.edit().putBoolean("accepted", false).apply()
            consentBox.visibility = View.GONE
            mapContainer.visibility = View.GONE
        }

        val container2 = root.findViewById<LinearLayout>(R.id.lieuxContainer)
        for (l in lieux) {
            val row = inflater.inflate(R.layout.item_lieu, container2, false)
            val icon = row.findViewById<ImageView>(R.id.lieuIcon)
            icon.setImageResource(if (l.resto) R.drawable.ic_restaurant else R.drawable.ic_library)
            icon.setBackgroundResource(R.drawable.bg_pin)
            row.findViewById<TextView>(R.id.lieuNom).text = l.nom
            val statutView = row.findViewById<TextView>(R.id.lieuStatut)
            val occView = row.findViewById<TextView>(R.id.lieuOcc)
            statutView.text = l.info
            statutView.setTextColor(resources.getColor(R.color.text_dim, null))
            occView.text = "Itinéraire ›"
            row.setOnClickListener { openPlace(l) }
            container2.addView(row)
        }

        return root
    }
}
