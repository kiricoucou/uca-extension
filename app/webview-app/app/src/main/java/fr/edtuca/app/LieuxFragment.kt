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

private data class Lieu(val nom: String, val resto: Boolean, val ouvert: Boolean, val occ: Int, val info: String = "")

/** Écran Lieux universitaires : gestion du consentement Google Maps et liste exhaustive des campus UCA. */
class LieuxFragment : Fragment() {

    private val lieux = listOf(
        Lieu("Marie-Hélène Lafon", resto = true, ouvert = true, occ = 62, info = "Campus des Cézeaux · Aubière"),
        Lieu("BU Cézeaux (Sciences & Tech)", resto = false, ouvert = true, occ = 48, info = "Bâtiment Sciences · 8h - 20h"),
        Lieu("Droit-Éco (Bd Mitterrand)", resto = false, ouvert = true, occ = 41, info = "Site Carnot · 8h - 19h"),
        Lieu("Odontologie (Dentaire)", resto = false, ouvert = false, occ = 0, info = "Clermont-Ferrand · Réouverture 14h"),
        Lieu("Sciences & STAPS Cézeaux", resto = true, ouvert = true, occ = 78, info = "Cafétéria Cézeaux · Déjeuner rapide"),
        Lieu("Santé & Pharmacie", resto = false, ouvert = true, occ = 23, info = "Campus Dunant · 8h - 19h"),
        Lieu("Le Dunant", resto = true, ouvert = true, occ = 70, info = "Resto U Dunant · Médecine"),
        Lieu("INSPÉ Chamalières", resto = true, ouvert = false, occ = 0, info = "Campus Chamalières"),
        Lieu("Le Manège Carnot", resto = true, ouvert = true, occ = 85, info = "Resto U Centre-ville · Carnot"),
        Lieu("BU Lettres & SHS Gergovia", resto = false, ouvert = true, occ = 52, info = "Bd Gergovia · 8h30 - 19h30"),
        Lieu("IUT Aubière (Informatique)", resto = false, ouvert = true, occ = 35, info = "Campus Cézeaux · Salles TP"),
        Lieu("ISIMA (École d'Ingénieurs)", resto = false, ouvert = true, occ = 29, info = "Campus Cézeaux · Bât. ISIMA"),
        Lieu("SIGMA Clermont", resto = false, ouvert = true, occ = 44, info = "Campus Cézeaux · Pôle Chimie/Méc")
    )

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
        mapWebView?.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
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
            icon.setBackgroundResource(if (l.ouvert) R.drawable.bg_pin else R.drawable.bg_pin_closed)
            row.findViewById<TextView>(R.id.lieuNom).text = l.nom
            val statutView = row.findViewById<TextView>(R.id.lieuStatut)
            val occView = row.findViewById<TextView>(R.id.lieuOcc)
            if (l.ouvert) {
                statutView.text = "OUVERT"
                statutView.setTextColor(resources.getColor(R.color.accent2, null))
                occView.text = "${l.occ}% occupé"
            } else {
                statutView.text = "FERMÉ"
                statutView.setTextColor(0xFFC0392B.toInt())
                occView.text = ""
            }
            container2.addView(row)
        }

        return root
    }
}
