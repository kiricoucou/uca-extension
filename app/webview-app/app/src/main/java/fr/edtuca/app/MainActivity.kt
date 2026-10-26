package fr.edtuca.app

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.google.android.material.bottomnavigation.BottomNavigationView

/**
 * Hôte unique de l'app My UCA.
 * Gère la navigation principale, la connexion CAS Odin, ainsi que la vérification
 * stricte des mises à jour GitHub avec écran bloquant infranchissable (Hard-Block).
 */
class MainActivity : AppCompatActivity() {

    private lateinit var bottomNav: BottomNavigationView

    // Composants de l'écran de blocage de mise à jour GitHub
    private lateinit var updateBlockerOverlay: View
    private lateinit var txtUpdateBadge: TextView
    private lateinit var txtUpdateSubtitle: TextView
    private lateinit var txtVersionsComparison: TextView
    private lateinit var txtCommitDetails: TextView
    private lateinit var txtPublishedDate: TextView
    private lateinit var txtChangelog: TextView
    private lateinit var layoutDownloadProgress: View
    private lateinit var progressBarDownload: ProgressBar
    private lateinit var txtDownloadStatus: TextView
    private lateinit var btnForceUpdate: Button
    private lateinit var btnOpenGithub: Button
    private lateinit var btnDevBypassTest: View

    private var isAppBlockedForUpdate: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bottomNav = findViewById(R.id.bottomNav)

        // Initialisation de l'overlay bloquant
        initUpdateBlocker()

        supportFragmentManager.addOnBackStackChangedListener {
            if (!isAppBlockedForUpdate && PrefsStore.isLoggedIn(this)) {
                bottomNav.visibility =
                    if (supportFragmentManager.backStackEntryCount == 0) View.VISIBLE
                    else View.GONE
            }
        }

        bottomNav.setOnItemSelectedListener { item ->
            if (isAppBlockedForUpdate) return@setOnItemSelectedListener false
            val frag: Fragment = when (item.itemId) {
                R.id.nav_home -> HomeFragment()
                R.id.nav_etudes -> EtudesFragment()
                R.id.nav_agenda -> AgendaFragment()
                R.id.nav_lieux -> LieuxFragment()
                R.id.nav_compte -> CompteFragment()
                else -> return@setOnItemSelectedListener false
            }
            showTab(frag)
            true
        }

        if (savedInstanceState == null) {
            if (PrefsStore.isLoggedIn(this)) {
                enterApp()
            } else {
                showGate()
            }
        }

        // Vérification automatique des mises à jour GitHub dès le lancement
        checkGithubUpdate()
    }

    override fun onResume() {
        super.onResume()
        if (!isAppBlockedForUpdate) {
            checkGithubUpdate()
        }
    }

    private fun initUpdateBlocker() {
        updateBlockerOverlay = findViewById(R.id.updateBlockerOverlay)
        txtUpdateBadge = updateBlockerOverlay.findViewById(R.id.txtUpdateBadge)
        txtUpdateSubtitle = updateBlockerOverlay.findViewById(R.id.txtUpdateSubtitle)
        txtVersionsComparison = updateBlockerOverlay.findViewById(R.id.txtVersionsComparison)
        txtCommitDetails = updateBlockerOverlay.findViewById(R.id.txtCommitDetails)
        txtPublishedDate = updateBlockerOverlay.findViewById(R.id.txtPublishedDate)
        txtChangelog = updateBlockerOverlay.findViewById(R.id.txtChangelog)
        layoutDownloadProgress = updateBlockerOverlay.findViewById(R.id.layoutDownloadProgress)
        progressBarDownload = updateBlockerOverlay.findViewById(R.id.progressBarDownload)
        txtDownloadStatus = updateBlockerOverlay.findViewById(R.id.txtDownloadStatus)
        btnForceUpdate = updateBlockerOverlay.findViewById(R.id.btnForceUpdate)
        btnOpenGithub = updateBlockerOverlay.findViewById(R.id.btnOpenGithub)
        btnDevBypassTest = updateBlockerOverlay.findViewById(R.id.btnDevBypassTest)

        btnDevBypassTest.setOnClickListener {
            // Permet aux développeurs et testeurs de masquer l'écran lors d'une session de test
            isAppBlockedForUpdate = false
            updateBlockerOverlay.visibility = View.GONE
            if (PrefsStore.isLoggedIn(this)) {
                bottomNav.visibility = View.VISIBLE
            }
            Toast.makeText(this, "Mode test : contournement temporaire activé", Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Interroge GitHub pour détecter si une nouvelle version a été pushée sur main.
     */
    fun checkGithubUpdate(onChecked: ((Boolean) -> Unit)? = null) {
        GithubUpdateManager.checkForUpdate(this) { updateInfo ->
            if (updateInfo != null && updateInfo.isUpdateAvailable) {
                showBlockingUpdateScreen(updateInfo)
                onChecked?.invoke(true)
            } else {
                onChecked?.invoke(false)
            }
        }
    }

    /**
     * Affiche l'écran bloquant infranchissable forçant l'installation de la mise à jour.
     * Si seul le code web/cours a changé : applique l'OTA ultra-rapide (2 secondes, ~390 Ko) sans réinstaller l'APK !
     */
    fun showBlockingUpdateScreen(updateInfo: GithubUpdateManager.UpdateInfo) {
        isAppBlockedForUpdate = true
        bottomNav.visibility = View.GONE
        updateBlockerOverlay.visibility = View.VISIBLE

        txtVersionsComparison.text = "Version installée : v${updateInfo.currentVersion} ➔ Nouvelle : v${updateInfo.latestVersion}"
        txtCommitDetails.text = "Branche : ${updateInfo.branch} · Commit : ${updateInfo.commitSha}"
        txtPublishedDate.text = "Publication GitHub : ${updateInfo.publishedAt}"
        txtChangelog.text = updateInfo.changelog.joinToString("\n") { "• $it" }

        layoutDownloadProgress.visibility = View.GONE
        btnForceUpdate.isEnabled = true

        if (updateInfo.isOtaUpdateAvailable && !updateInfo.isNativeApkRequired) {
            // Mode OTA Ultra-Rapide (2 secondes, pas de réinstallation APK)
            txtUpdateBadge.text = "⚡ MISE À JOUR RAPIDE (OTA - 2 SEC)"
            txtUpdateBadge.setTextColor(getColor(R.color.accent))
            txtUpdateBadge.setBackgroundResource(R.drawable.bg_card)
            txtUpdateSubtitle.text = "Nouveau push détecté sur main. L'application va se synchroniser à chaud en 2 secondes directement depuis GitHub, sans réinstaller l'APK."
            btnForceUpdate.text = "⚡ Mettre à jour en 2 secondes (OTA)"

            btnForceUpdate.setOnClickListener {
                layoutDownloadProgress.visibility = View.VISIBLE
                progressBarDownload.progress = 0
                txtDownloadStatus.text = "Téléchargement des fichiers modifiés..."
                btnForceUpdate.isEnabled = false

                GithubUpdateManager.downloadAndApplyOtaUpdate(
                    activity = this,
                    updateInfo = updateInfo,
                    onProgress = { pct ->
                        progressBarDownload.progress = pct
                        txtDownloadStatus.text = "Application des composants... $pct%"
                    },
                    onComplete = {
                        isAppBlockedForUpdate = false
                        updateBlockerOverlay.visibility = View.GONE
                        if (PrefsStore.isLoggedIn(this)) {
                            bottomNav.visibility = View.VISIBLE
                        }
                        Toast.makeText(this, "✅ My UCA est à jour (v${updateInfo.latestVersion}) !", Toast.LENGTH_SHORT).show()
                        (supportFragmentManager.findFragmentById(R.id.fragmentContainer) as? AgendaFragment)?.reloadWebView()
                    },
                    onError = { err ->
                        layoutDownloadProgress.visibility = View.GONE
                        btnForceUpdate.isEnabled = true
                        btnForceUpdate.text = "Réessayer la mise à jour OTA"
                        Toast.makeText(this, err, Toast.LENGTH_LONG).show()
                    }
                )
            }
        } else {
            // Mode APK Complet (uniquement si le code natif Android ou le Manifeste a évolué)
            txtUpdateBadge.text = "📦 MISE À JOUR NATIVE OBLIGATOIRE"
            txtUpdateBadge.setTextColor(getColor(R.color.danger))
            txtUpdateBadge.setBackgroundResource(R.drawable.bg_btn_logout)
            txtUpdateSubtitle.text = "Le socle natif Android a évolué (nouvelle version système ou permissions). L'installation du nouvel APK est nécessaire."
            btnForceUpdate.text = "📦 Télécharger et installer l'APK (48 Mo)"

            btnForceUpdate.setOnClickListener {
                layoutDownloadProgress.visibility = View.VISIBLE
                progressBarDownload.progress = 0
                txtDownloadStatus.text = "Connexion à GitHub..."
                btnForceUpdate.isEnabled = false

                GithubUpdateManager.downloadAndInstallApk(
                    activity = this,
                    apkUrl = updateInfo.apkDownloadUrl,
                    onProgress = { pct ->
                        progressBarDownload.progress = pct
                        txtDownloadStatus.text = "Téléchargement de l'APK... $pct%"
                    },
                    onError = { err ->
                        layoutDownloadProgress.visibility = View.GONE
                        btnForceUpdate.isEnabled = true
                        btnForceUpdate.text = "Réessayer le téléchargement"
                        Toast.makeText(this, err, Toast.LENGTH_LONG).show()
                        GithubUpdateManager.openGithubDownload(this, updateInfo.githubRepoUrl)
                    }
                )
            }
        }

        btnOpenGithub.setOnClickListener {
            GithubUpdateManager.openGithubDownload(this, updateInfo.githubRepoUrl)
        }

        btnDevBypassTest.visibility = View.VISIBLE
    }

    /**
     * Déclenche une simulation de mise à jour rapide OTA (2 sec).
     */
    fun triggerSimulatedOtaTest() {
        val simulated = GithubUpdateManager.createSimulatedOtaUpdate(this)
        showBlockingUpdateScreen(simulated)
    }

    /**
     * Déclenche une simulation de mise à jour native complète (APK).
     */
    fun triggerSimulatedNativeTest() {
        val simulated = GithubUpdateManager.createSimulatedNativeUpdate(this)
        showBlockingUpdateScreen(simulated)
    }

    fun triggerSimulatedUpdateTest() {
        triggerSimulatedOtaTest()
    }

    private fun showGate() {
        if (isAppBlockedForUpdate) return
        bottomNav.visibility = View.GONE
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, GateFragment())
            .commit()
    }

    /** Appelé par GateFragment juste après un login CAS réussi. */
    fun onLoggedIn() {
        enterApp()
    }

    /** Appelé depuis PreferencesFragment : efface la session, revient à l'écran de connexion unique. */
    fun logout() {
        PrefsStore.setLoggedIn(this, false)
        val cookies = android.webkit.CookieManager.getInstance()
        cookies.removeAllCookies { cookies.flush() }
        // Cours, notes, absences stockés en localStorage par la page + cache HTTP.
        android.webkit.WebStorage.getInstance().deleteAllData()
        android.webkit.WebView(this).apply { clearCache(true); destroy() }
        // Un autre utilisateur du téléphone ne doit plus voir l'EDT dans le calendrier système.
        val appCtx = applicationContext
        AgendaFragment.nativeSyncExecutor.execute {
            AgendaFragment.lastSyncedHash = 0
            PhoneCalendarSync.clear(appCtx)
            CourseReminderScheduler.cancelAll(appCtx)
            WidgetEventsStore.clear(appCtx)
            AgendaWidgetProvider.requestUpdate(appCtx)
            androidx.core.app.NotificationManagerCompat.from(appCtx).cancelAll()
        }
        supportFragmentManager.popBackStack(null, androidx.fragment.app.FragmentManager.POP_BACK_STACK_INCLUSIVE)
        showGate()
    }

    private fun enterApp() {
        if (isAppBlockedForUpdate) return
        bottomNav.visibility = View.VISIBLE
        showTab(AgendaFragment())
        bottomNav.selectedItemId = R.id.nav_agenda
    }

    private fun showTab(fragment: Fragment) {
        if (isAppBlockedForUpdate) return
        supportFragmentManager.popBackStack(null, androidx.fragment.app.FragmentManager.POP_BACK_STACK_INCLUSIVE)
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, fragment)
            .commit()
    }

    /** Ouvre un écran secondaire (Messagerie, Notifications, Préférences...) par-dessus l'onglet courant. */
    fun openSubScreen(fragment: Fragment) {
        if (isAppBlockedForUpdate) return
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, fragment)
            .addToBackStack(null)
            .commit()
    }

    override fun onBackPressed() {
        if (isAppBlockedForUpdate) {
            Toast.makeText(this, "Mise à jour requise pour continuer.", Toast.LENGTH_SHORT).show()
            return
        }
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStack()
        } else {
            super.onBackPressed()
        }
    }
}
