package fr.edtuca.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
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
        return root
    }
}
