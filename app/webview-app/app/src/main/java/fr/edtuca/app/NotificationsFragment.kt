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

        // Plus de lignes écrites en dur : seulement les vraies notifications reçues (mail, notes).
        val emptyState = root.findViewById<View>(R.id.notifEmptyState)
        val containerNotifs = root.findViewById<android.widget.LinearLayout>(R.id.notifContainer)
        containerNotifs.removeAllViews()
        val items = NotifStore.list(requireContext())
        if (!PrefsStore.isLoggedIn(requireContext()) || items.isEmpty()) {
            emptyState?.visibility = View.VISIBLE
            containerNotifs.visibility = View.GONE
            (emptyState as? android.view.ViewGroup)?.let { g ->
                for (n in 0 until g.childCount) (g.getChildAt(n) as? TextView)?.let { t ->
                    if (n == 1) t.text = if (PrefsStore.isLoggedIn(requireContext())) "Aucune notification pour l'instant. Un nouveau mail ou une nouvelle note apparaîtra ici." else t.text
                }
            }
        } else {
            emptyState?.visibility = View.GONE
            containerNotifs.visibility = View.VISIBLE
            val fmt = java.text.SimpleDateFormat("d MMM · HH:mm", java.util.Locale.FRANCE)
            val dp = resources.displayMetrics.density
            items.forEach { it0 ->
                val row = android.widget.LinearLayout(requireContext()).apply {
                    orientation = android.widget.LinearLayout.VERTICAL
                    setBackgroundResource(R.drawable.bg_card)
                    setPadding((14 * dp).toInt(), (12 * dp).toInt(), (14 * dp).toInt(), (12 * dp).toInt())
                    layoutParams = android.widget.LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = (10 * dp).toInt() }
                    isClickable = true
                    setOnClickListener {
                        parentFragmentManager.popBackStack()
                        if (it0.type == "mail") act.openSubScreen(MailFragment()) else bottomNav.selectedItemId = R.id.nav_etudes
                    }
                }
                row.addView(TextView(requireContext()).apply {
                    text = (if (it0.type == "mail") "✉️ " else "🎓 ") + it0.title
                    setTextColor(resources.getColor(if (it0.read) R.color.text_dim else R.color.text, null)); textSize = 15f; setTypeface(typeface, android.graphics.Typeface.BOLD)
                })
                row.addView(TextView(requireContext()).apply { text = it0.text; setTextColor(resources.getColor(R.color.text_dim, null)); textSize = 13f })
                row.addView(TextView(requireContext()).apply { text = fmt.format(java.util.Date(it0.at)); setTextColor(resources.getColor(R.color.text_dim, null)); textSize = 11.5f })
                containerNotifs.addView(row)
            }
        }

        root.findViewById<View>(R.id.btnMarkAllRead)?.setOnClickListener {
            NotifStore.markAllRead(requireContext())
            Toast.makeText(requireContext(), "Toutes les notifications sont marquées comme lues", Toast.LENGTH_SHORT).show()
            parentFragmentManager.beginTransaction().detach(this).commitNow(); parentFragmentManager.beginTransaction().attach(this).commit()
        }

        return root
    }
}
