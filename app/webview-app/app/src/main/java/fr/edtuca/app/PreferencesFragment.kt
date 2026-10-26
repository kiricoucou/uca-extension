package fr.edtuca.app

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import com.google.android.material.switchmaterial.SwitchMaterial

/**
 * Écran Préférences unique : synchronisation (calendrier téléphone réel,
 * demande la permission au moment où on active le switch), notifications
 * par catégorie (idem pour "Prochains cours"), langue, déconnexion. Un seul
 * endroit pour tous les réglages, comme dans l'app officielle.
 *
 * Pas de choix de thème ici : sombre/turquoise est LE thème du projet
 * (site, extension, app), pas une option — un mode clair casserait la
 * cohérence qu'on vient d'établir entre les écrans natifs et l'Agenda
 * embarqué (qui n'a plus de variante claire). Voir PrefsStore.applyThemeMode.
 */
class PreferencesFragment : Fragment() {

    private lateinit var switchSyncTel: SwitchMaterial
    private lateinit var switchCours: SwitchMaterial

    private val calendarPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val ok = granted[Manifest.permission.READ_CALENDAR] == true &&
            granted[Manifest.permission.WRITE_CALENDAR] == true
        PrefsStore.setBool(requireContext(), PrefsStore.K_SYNC_TEL, ok)
        switchSyncTel.isChecked = ok
    }

    private val notifPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        PrefsStore.setBool(requireContext(), PrefsStore.K_NOTIF_COURS, granted)
        switchCours.isChecked = granted
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_preferences, container, false)
        root.findViewById<TextView>(R.id.topbarTitle).text = "Préférences"
        root.findViewById<View>(R.id.backBtn).visibility = View.VISIBLE
        root.findViewById<View>(R.id.backBtn).setOnClickListener {
            requireActivity().supportFragmentManager.popBackStack()
        }

        val ctx = requireContext()

        bindSwitch(root, R.id.switchSyncAuto, PrefsStore.syncAuto(ctx)) { v -> PrefsStore.setBool(ctx, PrefsStore.K_SYNC_AUTO, v) }

        // Calendrier téléphone : écrit vraiment dans CalendarContract (PhoneCalendarSync),
        // besoin de READ/WRITE_CALENDAR -> on demande la permission seulement à l'activation.
        switchSyncTel = root.findViewById(R.id.switchSyncTel)
        switchSyncTel.isChecked = PrefsStore.syncTel(ctx)
        switchSyncTel.setOnCheckedChangeListener { _, checked ->
            if (checked) {
                calendarPermissionLauncher.launch(
                    arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
                )
            } else {
                PrefsStore.setBool(ctx, PrefsStore.K_SYNC_TEL, false)
            }
        }

        // Rappels "Prochains cours" : vraie notification locale programmée (CourseReminderScheduler),
        // besoin de POST_NOTIFICATIONS sur Android 13+ seulement.
        switchCours = root.findViewById(R.id.switchCours)
        switchCours.isChecked = PrefsStore.notifCours(ctx)
        switchCours.setOnCheckedChangeListener { _, checked ->
            if (checked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                PrefsStore.setBool(ctx, PrefsStore.K_NOTIF_COURS, checked)
            }
        }

        bindSwitch(root, R.id.switchCoursLigne, PrefsStore.notifCoursLigne(ctx)) { v -> PrefsStore.setBool(ctx, PrefsStore.K_NOTIF_COURS_LIGNE, v) }
        bindSwitch(root, R.id.switchBiblio, PrefsStore.notifBiblio(ctx)) { v -> PrefsStore.setBool(ctx, PrefsStore.K_NOTIF_BIBLIO, v) }
        bindSwitch(root, R.id.switchResto, PrefsStore.notifResto(ctx)) { v -> PrefsStore.setBool(ctx, PrefsStore.K_NOTIF_RESTO, v) }

        root.findViewById<View>(R.id.btnLogout).setOnClickListener {
            (requireActivity() as MainActivity).logout()
        }

        val txtGithubStatus = root.findViewById<TextView>(R.id.txtGithubUpdateStatus)
        root.findViewById<View>(R.id.btnCheckGithubUpdate)?.setOnClickListener {
            txtGithubStatus?.text = "Vérification en cours sur GitHub (branche main)..."
            (requireActivity() as MainActivity).checkGithubUpdate { updateAvailable ->
                if (!updateAvailable) {
                    txtGithubStatus?.text = "Application à jour avec la branche main !"
                }
            }
        }

        root.findViewById<View>(R.id.btnTestBlockingUpdate)?.setOnClickListener {
            (requireActivity() as MainActivity).triggerSimulatedUpdateTest()
        }

        try {
            val pkg = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            root.findViewById<TextView>(R.id.aboutVersion).text = "Version ${pkg.versionName}"
        } catch (e: Exception) { }

        return root
    }

    private fun bindSwitch(root: View, id: Int, initial: Boolean, onChange: (Boolean) -> Unit) {
        val switch = root.findViewById<SwitchMaterial>(id)
        switch.isChecked = initial
        switch.setOnCheckedChangeListener { _, checked -> onChange(checked) }
    }
}
