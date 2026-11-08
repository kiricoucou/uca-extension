package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.Toast
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment

/** Écran Livres empruntés : emprunts en cours + historique. */
class LivresFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_livres, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Livres empruntés"
        root.findViewById<View>(R.id.backBtn).visibility = View.VISIBLE
        root.findViewById<View>(R.id.backBtn).setOnClickListener {
            requireActivity().supportFragmentManager.popBackStack()
        }
        root.findViewById<View>(R.id.btnBuSite)?.setOnClickListener { openUrl("https://bu.uca.fr/") }
        root.findViewById<View>(R.id.btnBuLieux)?.setOnClickListener {
            requireActivity().supportFragmentManager.popBackStack()
            requireActivity().findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav).selectedItemId = R.id.nav_lieux
        }
        return root
    }

    private fun openUrl(url: String) {
        try { startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
        catch (_: Exception) { Toast.makeText(requireContext(), "Aucune application pour ouvrir ce lien.", Toast.LENGTH_SHORT).show() }
    }
}
