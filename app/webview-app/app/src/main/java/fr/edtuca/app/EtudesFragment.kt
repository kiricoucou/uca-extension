package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Études : cours en ligne, stage et emploi, scolarité, réglages notifications. */
class EtudesFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_etudes, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Études"

        val act = requireActivity() as MainActivity

        root.findViewById<ImageView>(R.id.topbarBell)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }
        root.findViewById<ImageView>(R.id.topbarPerson)?.setOnClickListener {
            val bottomNav = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
            bottomNav.selectedItemId = R.id.nav_compte
        }

        root.findViewById<View>(R.id.rowStage)?.setOnClickListener {
            act.openSubScreen(StageEmploiFragment())
        }
        root.findViewById<View>(R.id.rowScolarite)?.setOnClickListener {
            act.openSubScreen(ScolariteFragment())
        }
        root.findViewById<View>(R.id.rowNotifications)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }

        return root
    }
}
