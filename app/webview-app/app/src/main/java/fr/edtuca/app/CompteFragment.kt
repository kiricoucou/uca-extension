package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Mon compte : profil complet Odin, groupe de TP synchronisé, messagerie, préférences et déconnexion. */
class CompteFragment : Fragment() {

    private var photoView: ImageView? = null

    private val pickPhoto = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@registerForActivityResult
        val ctx = requireContext().applicationContext
        if (ProfilePhoto.save(ctx, uri)) showPhoto()
        else android.widget.Toast.makeText(ctx, "Image illisible, choisis une autre photo.", android.widget.Toast.LENGTH_SHORT).show()
    }

    /** Affiche la photo choisie en rond, ou l'icône par défaut. */
    private fun showPhoto() {
        val iv = photoView ?: return
        val bmp = ProfilePhoto.load(requireContext())
        if (bmp != null) {
            iv.setPadding(0, 0, 0, 0)
            iv.setImageBitmap(bmp)
            iv.outlineProvider = object : android.view.ViewOutlineProvider() {
                override fun getOutline(v: View, o: android.graphics.Outline) { o.setOval(0, 0, v.width, v.height) }
            }
            iv.clipToOutline = true
        } else {
            val pad = (3 * resources.displayMetrics.density).toInt()
            iv.setPadding(pad, pad, pad, pad)
            iv.setImageResource(R.drawable.ic_person)
            iv.clipToOutline = false
        }
    }

    private fun onPhotoClick() {
        if (!ProfilePhoto.exists(requireContext())) { pickPhoto.launch("image/*"); return }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Photo de profil")
            .setItems(arrayOf("Changer la photo", "Supprimer la photo")) { _, which ->
                if (which == 0) pickPhoto.launch("image/*")
                else { ProfilePhoto.delete(requireContext()); showPhoto() }
            }.show()
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_compte, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Mon compte"

        val act = requireActivity() as MainActivity

        root.findViewById<ImageView>(R.id.topbarBell)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }

        photoView = root.findViewById(R.id.imgStudentPhoto)
        photoView?.apply {
            contentDescription = "Photo de profil : touche pour la changer"
            setOnClickListener { onPhotoClick() }
        }
        showPhoto()

        fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
        fun pill(text: String, fg: Int, bg: Int): TextView = TextView(requireContext()).apply {
            this.text = text; setTextColor(fg); textSize = 12.5f; setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(12), dp(5), dp(12), dp(5))
            background = android.graphics.drawable.GradientDrawable().apply { setColor(bg); cornerRadius = dp(20).toFloat() }
        }
        val palette = intArrayOf(0xFF2FD6CD.toInt(), 0xFFA78BFA.toInt(), 0xFFFF7EB6.toInt(), 0xFFFFB454.toInt(), 0xFF60A5FA.toInt(), 0xFF6EE7A0.toInt(), 0xFFFFD84D.toInt())

        fun fill() {
            val ctx = context ?: return
            val sName = PrefsStore.studentName(ctx)
            val sId = PrefsStore.studentId(ctx)
            val sEmail = PrefsStore.studentEmail(ctx).takeIf { it.endsWith("@etu.uca.fr", true) } ?: ""
            val sForm = PrefsStore.studentFormation(ctx)
            val sBirth = PrefsStore.studentBirth(ctx)
            val sGroup = PrefsStore.studentGroup(ctx)
            val parts = sName.split(" ").filter { it.isNotBlank() }
            val nom = parts.firstOrNull { it == it.uppercase() && it.any { c -> c.isLetter() } } ?: ""
            val prenom = parts.filter { it != nom }.joinToString(" ")
            root.findViewById<TextView>(R.id.studentName)?.text = if (sName.isNotBlank()) (prenom + " " + nom).trim() else "Profil non détecté"
            root.findViewById<TextView>(R.id.zimbraEmail)?.text = sEmail.ifBlank { "Adresse non détectée : ouvre ton profil étudiant une fois" }
            root.findViewById<TextView>(R.id.studentFormation)?.text = sForm.ifBlank { "Université Clermont Auvergne" }

            // pastilles de l'en-tête : formation, naissance, n° étudiant
            val chips = root.findViewById<LinearLayout>(R.id.profileChips)
            chips?.removeAllViews()
            val white = 0xFFFFFFFF.toInt(); val glass = 0x33FFFFFF
            listOf(if (sBirth.isNotBlank()) "Né(e) le $sBirth" else "", if (sId.isNotBlank()) "N° $sId" else "").filter { it.isNotBlank() }.forEach { t ->
                chips?.addView(pill(t, white, glass), LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(8) })
            }

            // détails : une barre de couleur par champ
            val details = root.findViewById<LinearLayout>(R.id.profileDetails)
            details?.removeAllViews()
            val rows = listOf("Nom" to nom, "Prénom" to prenom, "Date de naissance" to sBirth, "N° étudiant" to sId, "Formation" to sForm, "Groupe" to sGroup, "Email" to sEmail)
            rows.forEachIndexed { i, (label, value) ->
                val color = palette[i % palette.size]
                val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(5), 0, dp(5)) }
                row.addView(View(ctx).apply { background = android.graphics.drawable.GradientDrawable().apply { setColor(color); cornerRadius = dp(2).toFloat() } }, LinearLayout.LayoutParams(dp(4), -1).apply { marginEnd = dp(10) })
                val col = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
                col.addView(TextView(ctx).apply { text = label.uppercase(); setTextColor(color); textSize = 10.5f; setTypeface(typeface, android.graphics.Typeface.BOLD); letterSpacing = 0.05f })
                col.addView(TextView(ctx).apply {
                    text = value.ifBlank { "non détecté" }
                    setTextColor(resources.getColor(if (value.isBlank()) R.color.text_dim else R.color.text, null)); textSize = 14.5f
                    if (value.isNotBlank()) setTypeface(typeface, android.graphics.Typeface.BOLD)
                })
                row.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
                details?.addView(row)
            }

            // groupes en pastilles de couleur
            val gc = root.findViewById<LinearLayout>(R.id.groupChips)
            gc?.removeAllViews()
            val groups = sGroup.split("·", ",").map { it.trim() }.filter { it.isNotBlank() }
            groups.forEachIndexed { i, g ->
                val col = palette[(i * 2 + 1) % palette.size]
                gc?.addView(pill(g, col, (col and 0x00FFFFFF) or 0x33000000), LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(8) })
            }
            root.findViewById<TextView>(R.id.groupHint)?.text =
                if (groups.isEmpty()) "Aucun groupe repéré : synchronise ton emploi du temps, ils apparaissent d'après les intitulés (TD, TP)."
                else "Repérés d'après les intitulés de tes cours sur Odin."
        }
        root.findViewById<TextView>(R.id.txtAboutVersion)?.text = "Centre d'aide · Conditions Générales d'Utilisation · Version " +
            (try { requireContext().packageManager.getPackageInfo(requireContext().packageName, 0).versionName } catch (_: Exception) { "" })
        fill()
        // Relit la fiche d'Odin avec la session de l'app (sans effet si la session a expiré).
        ProfileSync.run(requireContext()) { fill() }
        root.findViewById<View>(R.id.btnOdinProfile)?.setOnClickListener {
            act.openSubScreen(WebPageFragment.of(ProfileSync.ODIN_HOME, "Mon profil étudiant"))
        }
        // Le bouton « Accéder à ma messagerie » ouvre Zimbra avec la même session.

        root.findViewById<View>(R.id.btnPreferences)?.setOnClickListener {
            act.openSubScreen(PreferencesFragment())
        }
        root.findViewById<View>(R.id.btnMessagerie)?.setOnClickListener {
            act.openSubScreen(MailFragment())
        }
        root.findViewById<View>(R.id.btnLoginCompte)?.apply {
            visibility = if (PrefsStore.sessionExpired(requireContext())) View.VISIBLE else View.GONE
            setOnClickListener { act.startLogin() }
        }
        root.findViewById<View>(R.id.btnLogoutCompte)?.setOnClickListener {
            act.logout()
        }

        return root
    }

    override fun onDestroyView() {
        photoView = null
        super.onDestroyView()
    }
}
