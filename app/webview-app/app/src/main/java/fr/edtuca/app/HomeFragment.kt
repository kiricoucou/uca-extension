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

        return root
    }
}
