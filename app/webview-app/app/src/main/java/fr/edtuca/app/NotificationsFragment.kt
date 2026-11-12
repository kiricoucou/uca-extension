package fr.edtuca.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment

/**
 * Écran Notifications UCA : liste des actualités (mail, notes), avec gestion par l'utilisateur :
 * filtres (toutes, non lues, gardées), lue / non lue, garder, supprimer, tout supprimer sauf les gardées.
 * La durée de conservation se règle dans Préférences.
 */
class NotificationsFragment : Fragment() {

    private var filter = "all"   // all | unread | kept

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
        val containerNotifs = root.findViewById<LinearLayout>(R.id.notifContainer)
        val ctx = requireContext()
        val dp = resources.displayMetrics.density
        fun px(v: Int) = (v * dp).toInt()

        /** Petit bouton texte (zone tactile d'au moins 40 dp). */
        fun action(label: String, danger: Boolean = false, selected: Boolean = false, onClick: () -> Unit) = TextView(ctx).apply {
            text = label; textSize = 12.5f; gravity = Gravity.CENTER
            setTypeface(typeface, if (selected) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
            setTextColor(resources.getColor(if (danger) R.color.danger else R.color.accent2, null))
            minHeight = px(40); setPadding(px(10), px(6), px(10), px(6))
            isClickable = true; isFocusable = true
            contentDescription = label
            setOnClickListener { onClick() }
        }

        fun render() {
            containerNotifs.removeAllViews()
            val all = NotifStore.list(ctx)
            if (!PrefsStore.isLoggedIn(ctx) || all.isEmpty()) {
                emptyState?.visibility = View.VISIBLE
                containerNotifs.visibility = View.GONE
                (emptyState as? ViewGroup)?.let { g ->
                    for (n in 0 until g.childCount) (g.getChildAt(n) as? TextView)?.let { t ->
                        if (n == 1) t.text = if (PrefsStore.isLoggedIn(ctx)) "Aucune notification pour l'instant. Un nouveau mail ou une nouvelle note apparaîtra ici." else t.text
                    }
                }
                return
            }
            emptyState?.visibility = View.GONE
            containerNotifs.visibility = View.VISIBLE

            // Filtres
            val unread = all.count { !it.read }; val kept = all.count { it.kept }
            val chips = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(4) } }
            listOf("all" to "Toutes", "unread" to "Non lues" + if (unread > 0) " ($unread)" else "", "kept" to "Gardées" + if (kept > 0) " ($kept)" else "").forEach { (id, label) ->
                chips.addView(action(label, selected = filter == id) { filter = id; render() })
            }
            containerNotifs.addView(chips)
            // Outils
            val tools = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(8) } }
            tools.addView(action("Supprimer tout sauf les gardées", danger = true) {
                NotifStore.clearExceptKept(ctx)
                Toast.makeText(ctx, "Notifications supprimées (les gardées restent)", Toast.LENGTH_SHORT).show()
                render()
            })
            containerNotifs.addView(tools)

            val items = all.filter { if (filter == "unread") !it.read else if (filter == "kept") it.kept else true }
            if (items.isEmpty()) {
                containerNotifs.addView(TextView(ctx).apply { text = "Rien dans cette catégorie."; setTextColor(resources.getColor(R.color.text_dim, null)); textSize = 13f; setPadding(px(4), px(12), px(4), px(12)) })
            }
            val fmt = java.text.SimpleDateFormat("d MMM · HH:mm", java.util.Locale.FRANCE)
            items.forEach { it0 ->
                val row = LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundResource(R.drawable.bg_card)
                    setPadding(px(14), px(12), px(14), px(8))
                    layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = px(10) }
                    isClickable = true
                    setOnClickListener {
                        parentFragmentManager.popBackStack()
                        if (it0.type == "mail") act.openSubScreen(MailFragment()) else bottomNav.selectedItemId = R.id.nav_etudes
                    }
                }
                row.addView(TextView(ctx).apply {
                    text = (if (it0.kept) "★ " else "") + (if (it0.type == "mail") "✉️ " else "🎓 ") + it0.title
                    setTextColor(resources.getColor(if (it0.read) R.color.text_dim else R.color.text, null)); textSize = 15f; setTypeface(typeface, android.graphics.Typeface.BOLD)
                })
                row.addView(TextView(ctx).apply { text = it0.text; setTextColor(resources.getColor(R.color.text_dim, null)); textSize = 13f })
                row.addView(TextView(ctx).apply { text = fmt.format(java.util.Date(it0.at)); setTextColor(resources.getColor(R.color.text_dim, null)); textSize = 11.5f })
                val acts = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
                acts.addView(action(if (it0.read) "Non lue" else "Lue") { NotifStore.toggleRead(ctx, it0); render() })
                acts.addView(action(if (it0.kept) "★ Gardée" else "☆ Garder", selected = it0.kept) { NotifStore.toggleKeep(ctx, it0); render() })
                acts.addView(action("Supprimer", danger = true) { NotifStore.delete(ctx, it0); render() })
                row.addView(acts)
                containerNotifs.addView(row)
            }
        }
        render()

        root.findViewById<View>(R.id.btnMarkAllRead)?.setOnClickListener {
            NotifStore.markAllRead(ctx)
            Toast.makeText(ctx, "Toutes les notifications sont marquées comme lues", Toast.LENGTH_SHORT).show()
            render()
        }

        return root
    }
}
