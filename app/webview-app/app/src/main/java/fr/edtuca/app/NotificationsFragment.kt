package fr.edtuca.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment

/** Écran Notifications UCA : liste des actualités, alertes notes, changements d'EDT et annonces. */
class NotificationsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_notifications, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Notifications"

        val back = root.findViewById<ImageButton>(R.id.backBtn)
        back.visibility = View.VISIBLE
        back.setOnClickListener {
            parentFragmentManager.popBackStack()
        }

        val act = requireActivity() as MainActivity
        val bottomNav = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)

        // Rendre chaque notification cliquable vers son détail exact
        root.findViewById<View>(R.id.rowNotifNotes)?.setOnClickListener {
            parentFragmentManager.popBackStack()
            bottomNav.selectedItemId = R.id.nav_etudes
        }

        root.findViewById<View>(R.id.rowNotifEdt)?.setOnClickListener {
            parentFragmentManager.popBackStack()
            bottomNav.selectedItemId = R.id.nav_agenda
        }

        root.findViewById<View>(R.id.rowNotifAbsences)?.setOnClickListener {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://odin.iut.uca.fr/etudiants/?p=absences"))
                startActivity(intent)
            } catch (e: Exception) {
                parentFragmentManager.popBackStack()
                bottomNav.selectedItemId = R.id.nav_etudes
            }
        }

        root.findViewById<View>(R.id.rowNotifZimbra)?.setOnClickListener {
            parentFragmentManager.popBackStack()
            act.openSubScreen(MailFragment())
        }

        val emptyState = root.findViewById<View>(R.id.notifEmptyState)
        val containerNotifs = root.findViewById<View>(R.id.notifContainer)

        val loggedIn = PrefsStore.isLoggedIn(requireContext())
        if (!loggedIn) {
            emptyState?.visibility = View.VISIBLE
            containerNotifs?.visibility = View.GONE
        } else {
            emptyState?.visibility = View.GONE
            containerNotifs?.visibility = View.VISIBLE
        }

        root.findViewById<View>(R.id.btnMarkAllRead)?.setOnClickListener {
            Toast.makeText(requireContext(), "Toutes les notifications sont marquées comme lues", Toast.LENGTH_SHORT).show()
        }

        return root
    }
}
