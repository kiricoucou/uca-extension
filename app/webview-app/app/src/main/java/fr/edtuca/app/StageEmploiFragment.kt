package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Stage et Emploi : offres locales partenaires UCA et informations de conventionnement. */
class StageEmploiFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_stage_emploi, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Stage & Emploi"

        val back = root.findViewById<ImageButton>(R.id.backBtn)
        back.visibility = View.VISIBLE
        back.setOnClickListener {
            parentFragmentManager.popBackStack()
        }

        root.findViewById<View>(R.id.btnPstage)?.setOnClickListener { openUrl("https://ent.uca.fr/") }
        root.findViewById<View>(R.id.btnOffresUca)?.setOnClickListener { openUrl("https://www.uca.fr/formation/orientation-et-insertion-professionnelle") }
        root.findViewById<View>(R.id.btn1j1s)?.setOnClickListener { openUrl("https://www.1jeune1solution.gouv.fr/") }
        return root
    }

    private fun openUrl(url: String) {
        try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
        catch (_: Exception) { Toast.makeText(requireContext(), "Aucune application pour ouvrir ce lien.", Toast.LENGTH_SHORT).show() }
    }
}
