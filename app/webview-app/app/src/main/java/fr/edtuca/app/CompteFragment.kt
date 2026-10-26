package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.ImageView
import android.widget.Spinner
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Mon compte : profil complet Odin, groupe de TP synchronisé, messagerie, préférences et déconnexion. */
class CompteFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_compte, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Mon compte"

        val act = requireActivity() as MainActivity

        root.findViewById<ImageView>(R.id.topbarBell)?.setOnClickListener {
            act.openSubScreen(NotificationsFragment())
        }

        val sName = PrefsStore.studentName(requireContext())
        val sId = PrefsStore.studentId(requireContext())
        val sEmail = PrefsStore.studentEmail(requireContext())
        val sForm = PrefsStore.studentFormation(requireContext())
        val sBirth = PrefsStore.studentBirth(requireContext())

        if (sName.isNotBlank()) {
            root.findViewById<TextView>(R.id.studentName)?.text = sName
        } else {
            root.findViewById<TextView>(R.id.studentName)?.text = "Étudiant UCA (Connecté)"
        }

        if (sId.isNotBlank()) {
            root.findViewById<TextView>(R.id.studentId)?.text = "N° Étudiant : $sId"
        }

        if (sForm.isNotBlank()) {
            root.findViewById<TextView>(R.id.studentFormation)?.text = sForm
        }

        if (sBirth.isNotBlank()) {
            root.findViewById<TextView>(R.id.studentBirthDate)?.text = sBirth
        }

        if (sEmail.isNotBlank()) {
            root.findViewById<TextView>(R.id.zimbraEmail)?.text = sEmail
        }

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
        root.findViewById<View>(R.id.btnLogoutCompte)?.setOnClickListener {
            act.logout()
        }

        return root
    }
}
