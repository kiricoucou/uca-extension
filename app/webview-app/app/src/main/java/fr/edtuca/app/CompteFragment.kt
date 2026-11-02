package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.Spinner
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

        fun fill() {
            val ctx = context ?: return
            val sName = PrefsStore.studentName(ctx)
            val sId = PrefsStore.studentId(ctx)
            val sEmail = PrefsStore.studentEmail(ctx).takeIf { it.endsWith("@etu.uca.fr", true) } ?: ""
            val sForm = PrefsStore.studentFormation(ctx)
            val sBirth = PrefsStore.studentBirth(ctx)
            val sGroup = PrefsStore.studentGroup(ctx)
            root.findViewById<TextView>(R.id.studentName)?.text = if (sName.isNotBlank()) sName else "Profil non détecté"
            root.findViewById<TextView>(R.id.studentId)?.text = "N° étudiant : " + sId.ifBlank { "non détecté" }
            root.findViewById<TextView>(R.id.studentFormation)?.text = sForm.ifBlank { "Université Clermont Auvergne" }
            root.findViewById<TextView>(R.id.studentBirthDate)?.text = if (sBirth.isNotBlank()) "Né(e) le $sBirth" else ""
            root.findViewById<TextView>(R.id.zimbraEmail)?.text = sEmail.ifBlank { "Adresse non détectée (ouvre la messagerie une fois)" }
            val details = root.findViewById<LinearLayout>(R.id.profileDetails)
            details?.removeAllViews()
            val parts = sName.split(" ").filter { it.isNotBlank() }
            val nom = parts.firstOrNull { it == it.uppercase() && it.any { c -> c.isLetter() } } ?: ""
            val prenom = parts.filter { it != nom }.joinToString(" ")
            listOf("Nom" to nom, "Prénom" to prenom, "Date de naissance" to sBirth, "N° étudiant" to sId, "Formation" to sForm, "Groupe" to sGroup, "Email" to sEmail).forEach { (label, value) ->
                val row = TextView(ctx).apply {
                    text = "$label : " + value.ifBlank { "non détecté" }
                    setTextColor(resources.getColor(if (value.isBlank()) R.color.text_dim else R.color.text, null)); textSize = 13f
                    setPadding(0, 3, 0, 3)
                }
                details?.addView(row)
            }
        }
        fill()
        // Relit la fiche d'Odin avec la session de l'app (sans effet si la session a expiré).
        ProfileSync.run(requireContext()) { fill() }
        root.findViewById<View>(R.id.btnOdinProfile)?.setOnClickListener {
            act.openSubScreen(WebPageFragment.of(ProfileSync.ODIN_HOME, "Mon profil étudiant"))
        }
        // Le bouton « Accéder à ma messagerie » ouvre Zimbra avec la même session.

        val spinner = root.findViewById<Spinner>(R.id.ufrSpinner)
        val adapter = ArrayAdapter.createFromResource(
            requireContext(), R.array.ufr_groupes, android.R.layout.simple_spinner_item
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter

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
