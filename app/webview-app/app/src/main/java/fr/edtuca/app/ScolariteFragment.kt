package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment

/** Écran Scolarité : certificat officiel, données étudiant et contacts du secrétariat. */
class ScolariteFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_scolarite, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Scolarité"

        val back = root.findViewById<ImageButton>(R.id.backBtn)
        back.visibility = View.VISIBLE
        back.setOnClickListener {
            parentFragmentManager.popBackStack()
        }

        root.findViewById<Button>(R.id.btnDownloadCertificat)?.setOnClickListener {
            Toast.makeText(requireContext(), "Certificat de scolarité téléchargé (PDF)", Toast.LENGTH_SHORT).show()
        }

        return root
    }
}
