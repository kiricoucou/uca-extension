package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Accueil : statut des services UCA, raccourcis, notifications, actualités. */
class HomeFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_home, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Accueil"

        val act = requireActivity() as MainActivity
        val bottomNav = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)

        root.findViewById<ImageView>(R.id.topbarBell)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }
        root.findViewById<ImageView>(R.id.topbarPerson)?.setOnClickListener {
            bottomNav.selectedItemId = R.id.nav_compte
        }

        root.findViewById<View>(R.id.bannerNotification)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }

        root.findViewById<View>(R.id.rowMessagerie)?.setOnClickListener {
            act.openSubScreen(MailFragment())
        }
        root.findViewById<View>(R.id.rowLivres)?.setOnClickListener {
            act.openSubScreen(LivresFragment())
        }
        root.findViewById<View>(R.id.rowLieux)?.setOnClickListener {
            bottomNav.selectedItemId = R.id.nav_lieux
        }
        root.findViewById<View>(R.id.rowTransport)?.setOnClickListener {
            act.openSubScreen(TransportFragment())
        }

        val unread = NotifStore.unread(requireContext())
        root.findViewById<TextView>(R.id.bannerNotifText)?.text =
            if (unread > 0) "$unread nouvelle${if (unread > 1) "s" else ""} notification${if (unread > 1) "s" else ""}" else "Aucune nouvelle notification"
        checkStatus(root)
        return root
    }

    /** Statut réel des services, vérifié depuis le téléphone (mêmes sites et mêmes seuils que core/status.js de l'app web). */
    private fun checkStatus(root: View) {
        val sites = listOf(
            R.id.statusOdin to "https://odin.iut.uca.fr/", R.id.statusCas to "https://ent.uca.fr/",
            R.id.statusMoodle to "https://moodle.uca.fr/", R.id.statusMail to "https://mail.uca.fr/zimbra/",
            R.id.statusSite to "https://kiricoucou.github.io/uca-extension/"
        )
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        sites.forEach { (id, url) ->
            val tv = root.findViewById<TextView>(id) ?: return@forEach
            tv.text = "● Vérification…"; tv.setTextColor(0xFF60A5FA.toInt())
            Thread {
                val t0 = System.currentTimeMillis()
                val state = try {
                    val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                    c.connectTimeout = 8000; c.readTimeout = 8000; c.instanceFollowRedirects = true; c.requestMethod = "GET"
                    val code = c.responseCode; c.disconnect()
                    val ms = System.currentTimeMillis() - t0
                    if (code >= 500 || code == 404) "down" else if (ms > 2500) "slow" else "ok"
                } catch (_: Exception) { "down" }
                main.post {
                    if (!isAdded) return@post
                    tv.text = when (state) { "ok" -> "● Répond"; "slow" -> "● Lent"; else -> "● Injoignable" }
                    tv.setTextColor(when (state) { "ok" -> 0xFF6EE7A0.toInt(); "slow" -> 0xFFFFB454.toInt(); else -> 0xFFFF6B6B.toInt() })
                }
            }.start()
        }
    }
}
