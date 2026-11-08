package fr.edtuca.app

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment

/**
 * Écran affiché avant la bottom nav tant que l'utilisateur ne s'est pas
 * connecté. Un seul login CAS ici débloque tout le reste de l'app (Agenda,
 * Lieux, Messagerie...) — pas de reconnexion par fonctionnalité.
 */
class GateFragment : Fragment() {

    companion object {
        const val ARG_EXPIRED = "expired"
        fun expired() = GateFragment().apply { arguments = Bundle().apply { putBoolean(ARG_EXPIRED, true) } }
    }

    private val loginLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            PrefsStore.setLoggedIn(requireContext(), true)
            SessionDiag.log(requireContext(), "connexion réussie (écran de démarrage)")
            (requireActivity() as MainActivity).onLoggedIn()
        } else {
            view?.findViewById<View>(R.id.gateError)?.visibility = View.VISIBLE
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_gate, container, false)
        if (arguments?.getBoolean(ARG_EXPIRED) == true) {
            root.findViewById<android.widget.TextView>(R.id.gateIntro).text =
                "Ta session UCA a expiré. L'application est verrouillée : reconnecte-toi pour retrouver ton agenda, tes notes et tes absences."
        }
        root.findViewById<View>(R.id.btnLogin).setOnClickListener {
            root.findViewById<View>(R.id.gateError).visibility = View.GONE
            loginLauncher.launch(Intent(requireContext(), LoginActivity::class.java))
        }
        return root
    }
}
