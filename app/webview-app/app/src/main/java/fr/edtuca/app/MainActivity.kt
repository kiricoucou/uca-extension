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

    private var apkInstallPending = false   // APK téléchargé, installation demandée à Android : le bouton devient « Relancer la demande »
    @Volatile var isAppBlockedForUpdate: Boolean = false   // écran de mise à jour affiché : rien d'autre ne doit passer au-dessus

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        ClassSync.progressListener = { pct, msg -> showClassProgress(pct, msg) }
        PrefsStore.migrateProfileOnce(this)

        bottomNav = findViewById(R.id.bottomNav)

        // Initialisation de l'overlay bloquant
        initUpdateBlocker()

        findViewById<View>(R.id.sessionBanner)?.setOnClickListener { startLogin() }
        showSessionBanner(PrefsStore.isLoggedIn(this) && PrefsStore.sessionExpired(this))

        // Le petit bonhomme de la barre du haut mène à « Mon compte », sur tous les écrans qui l'affichent.
        supportFragmentManager.registerFragmentLifecycleCallbacks(object : androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks() {
            override fun onFragmentViewCreated(fm: androidx.fragment.app.FragmentManager, f: Fragment, v: View, savedInstanceState: Bundle?) {
                v.findViewById<View>(R.id.topbarPerson)?.setOnClickListener { openAccount() }
            }
        }, false)

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
        // L'APK téléchargé ne sert plus une fois installé : on le supprime (celui de moins de 10 min peut encore être en cours d'installation).
        GithubUpdateManager.cleanupDownloadedApks(this, 10 * 60 * 1000L)
        if (!isAppBlockedForUpdate) {
            checkGithubUpdate()
        } else if (apkInstallPending) {
            showRelaunchInstall()   // retour de l'installateur (annulé ou refusé) : le bouton est de nouveau disponible
        }
        checkSessionIfNeeded()
        checkLiveUpdate()
        MailWatcher.check(this)
        periodicHandler.postDelayed(periodicCheck, PERIOD_MS)
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
        txtChangelog.text = formatChangelog(updateInfo.changelog)
        showSessionBanner(false)   // d'abord la mise à jour, ensuite la reconnexion

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
                        showSessionBanner(PrefsStore.isLoggedIn(this) && PrefsStore.sessionExpired(this))
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
            btnForceUpdate.text = "📦 Télécharger et installer l'APK"

            apkInstallPending = false
            btnForceUpdate.setOnClickListener {
                // Installation déjà demandée puis annulée : on relance tout de suite la demande avec l'APK déjà téléchargé (rapide, sans retélécharger).
                if (apkInstallPending && GithubUpdateManager.relaunchInstall(this)) {
                    txtDownloadStatus.text = "Demande d'installation relancée…"
                    return@setOnClickListener
                }
                apkInstallPending = false
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
                    },
                    onInstallLaunched = {
                        apkInstallPending = true
                        showRelaunchInstall()
                    }
                )
            }
        }

        btnOpenGithub.setOnClickListener {
            GithubUpdateManager.openGithubDownload(this, updateInfo.githubRepoUrl)
        }

        val debuggable = (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        btnDevBypassTest.visibility = if (debuggable) View.VISIBLE else View.GONE
    }

    /** APK prêt, installation demandée : si l'utilisateur annule (« Ouvrir avec… », écran d'installation), un bouton permet de relancer la demande tout de suite. */
    private fun showRelaunchInstall() {
        layoutDownloadProgress.visibility = View.VISIBLE
        progressBarDownload.progress = 100
        txtDownloadStatus.text = "APK téléchargé. Si tu as annulé l'installation, appuie sur « Relancer la demande »."
        btnForceUpdate.isEnabled = true
        btnForceUpdate.text = "↻ Relancer la demande d'installation"
    }

    /** Lignes « ##v1.4.11 · titre » = en-tête de version (en gras), les autres = puces. */
    private fun formatChangelog(lines: List<String>): CharSequence {
        val sb = android.text.SpannableStringBuilder()
        lines.forEach { line ->
            if (sb.isNotEmpty()) sb.append("\n")
            if (line.startsWith("##")) {
                if (sb.isNotEmpty()) sb.append("\n")
                val start = sb.length
                sb.append(line.removePrefix("##"))
                sb.setSpan(android.text.style.StyleSpan(android.graphics.Typeface.BOLD), start, sb.length, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.setSpan(android.text.style.ForegroundColorSpan(getColor(R.color.text)), start, sb.length, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            } else {
                sb.append("• ").append(line)
            }
        }
        return sb
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

    private fun showGate(expired: Boolean = false) {
        if (isAppBlockedForUpdate) return
        bottomNav.visibility = View.GONE
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragmentContainer, if (expired) GateFragment.expired() else GateFragment())
            .commitAllowingStateLoss()
    }

    /** Va à l'onglet Mon compte, quel que soit l'écran affiché. */
    fun openAccount() {
        if (isAppBlockedForUpdate || !PrefsStore.isLoggedIn(this)) return
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStack(null, androidx.fragment.app.FragmentManager.POP_BACK_STACK_INCLUSIVE)
            bottomNav.visibility = View.VISIBLE
        }
        if (bottomNav.selectedItemId != R.id.nav_compte) bottomNav.selectedItemId = R.id.nav_compte
    }

    // Contrôle régulier des mises à jour sur GitHub tant que l'app est ouverte (en plus du contrôle horaire en arrière-plan).
    private val periodicHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val periodicCheck = object : Runnable {
        override fun run() {
            if (!isAppBlockedForUpdate) { checkGithubUpdate(); checkLiveUpdate(); MailWatcher.check(this@MainActivity) }
            periodicHandler.postDelayed(this, PERIOD_MS)
        }
    }
    private val PERIOD_MS = 15 * 60 * 1000L

    override fun onStop() {
        // La session (cookies de la WebView) doit survivre à la fermeture de l'app : écriture sur le disque aussi à l'arrêt.
        android.webkit.CookieManager.getInstance().flush()
        super.onStop()
    }

    override fun onPause() {
        // La session CAS (cookies de la WebView) doit survivre à la fermeture de l'app : on force l'écriture sur le disque.
        android.webkit.CookieManager.getInstance().flush()
        periodicHandler.removeCallbacks(periodicCheck)
        super.onPause()
    }

    private var lastSessionCheck = 0L
    private var lastLiveCheck = 0L

    /**
     * Mise à jour automatique des pages depuis GitHub (paquet signé, voir LiveUpdate), au plus toutes les 30 minutes
     * sauf demande manuelle. Une version qui change le code natif passe par l'écran d'installation de l'APK.
     */
    fun checkLiveUpdate(manual: Boolean = false, onDone: ((String) -> Unit)? = null) {
        val now = System.currentTimeMillis()
        if (!manual && now - lastLiveCheck < 10 * 60 * 1000) return
        lastLiveCheck = now
        LiveUpdate.checkAndApply(this) { result ->
            if (isFinishing || isDestroyed) return@checkAndApply
            when (result) {
                is LiveUpdate.Result.Applied -> {
                    Toast.makeText(this, "Application mise à jour (${result.version})", Toast.LENGTH_LONG).show()
                    (supportFragmentManager.findFragmentById(R.id.fragmentContainer) as? AgendaFragment)?.reloadWebView()
                    onDone?.invoke("Mise à jour ${result.version} installée.")
                }
                is LiveUpdate.Result.UpToDate -> onDone?.invoke("Application à jour.")
                is LiveUpdate.Result.NeedsApk -> onDone?.invoke("Une nouvelle version complète de l'application est disponible.")
                is LiveUpdate.Result.Failed -> onDone?.invoke("Mise à jour impossible (${result.reason}). L'application continue de fonctionner.")
            }
        }
    }

    private val loginLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            PrefsStore.setLoggedIn(this, true)
            SessionDiag.log(this, "connexion réussie")
            clearSessionExpired()
            (supportFragmentManager.findFragmentById(R.id.fragmentContainer) as? AgendaFragment)?.resyncNow()
        }
    }

    /** Ouvre la page de connexion officielle du CAS (l'utilisateur tape lui-même ses codes). */
    fun startLogin() {
        if (isAppBlockedForUpdate) return   // d'abord la mise à jour
        loginLauncher.launch(android.content.Intent(this, LoginActivity::class.java))
    }


    private var syncPulse: android.animation.Animator? = null
    private val syncHide = Runnable { showClassProgress(-1, null) }

    /**
     * Récupération de l'emploi du temps de la classe : halo bleu dégradé qui pulse sur les bords de l'écran et carte « en direct »
     * en bas avec une barre 0-100 %. [pct] < 0 masque tout ; 100 affiche « terminé » puis masque après un court instant.
     */
    fun showClassProgress(pct: Int, msg: String?) {
        val overlay = findViewById<View>(R.id.classSyncOverlay) ?: return
        overlay.removeCallbacks(syncHide)
        if (pct in 0..99) overlay.postDelayed(syncHide, 90_000)   // garde-fou : jamais d'overlay bloqué si une étape n'annonce rien
        if (pct < 0) {
            ClassSync.userRequested = false
            syncPulse?.cancel(); syncPulse = null
            overlay.visibility = View.GONE
            return
        }
        if (overlay.visibility != View.VISIBLE) {
            overlay.visibility = View.VISIBLE
            val glow = listOf(R.id.syncGlowTop, R.id.syncGlowBottom, R.id.syncBorder).mapNotNull { findViewById<View>(it) }
            val live = findViewById<View>(R.id.syncLive)
            syncPulse?.cancel()
            val anims = glow.map { v ->
                android.animation.ObjectAnimator.ofFloat(v, View.ALPHA, 0.45f, 1f).apply { duration = 1100; repeatCount = android.animation.ValueAnimator.INFINITE; repeatMode = android.animation.ValueAnimator.REVERSE }
            } + listOfNotNull(live?.let { v ->
                android.animation.ObjectAnimator.ofFloat(v, View.ALPHA, 1f, 0.45f).apply { duration = 650; repeatCount = android.animation.ValueAnimator.INFINITE; repeatMode = android.animation.ValueAnimator.REVERSE }
            })
            syncPulse = android.animation.AnimatorSet().apply { playTogether(anims); start() }
        }
        val p = pct.coerceIn(0, 100)
        findViewById<android.widget.ProgressBar>(R.id.syncBar)?.let { bar -> android.animation.ObjectAnimator.ofInt(bar, "progress", bar.progress, p).setDuration(350).start() }
        findViewById<android.widget.TextView>(R.id.syncPct)?.text = "$p %"
        if (msg != null) findViewById<android.widget.TextView>(R.id.syncMsg)?.text = msg
        if (p >= 100) overlay.postDelayed(syncHide, 1100)
    }

    private var sessionPulse: android.animation.ObjectAnimator? = null

    /** Rouge, fixe en bas à gauche, il clignote doucement (cadenas animé) pour attirer l'attention. */
    private fun showSessionBanner(show: Boolean) {
        val banner = findViewById<View>(R.id.sessionBanner) ?: return
        val show = show && !isAppBlockedForUpdate
        banner.visibility = if (show) View.VISIBLE else View.GONE
        sessionPulse?.cancel(); sessionPulse = null
        banner.alpha = 1f; banner.scaleX = 1f; banner.scaleY = 1f
        if (show) {
            sessionPulse = android.animation.ObjectAnimator.ofPropertyValuesHolder(
                banner,
                android.animation.PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0.6f),
                android.animation.PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.05f),
                android.animation.PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.05f)
            ).apply {
                duration = 700; repeatCount = android.animation.ValueAnimator.INFINITE; repeatMode = android.animation.ValueAnimator.REVERSE
                start()
            }
        }
    }

    /**
     * Session CAS expirée : l'app reste consultable (emploi du temps, notes, absences déjà synchronisés).
     * Un bandeau rouge propose de se reconnecter ; le menu de l'agenda et l'écran Compte ont aussi un bouton « Se connecter ».
     */
    fun requireLogin() {
        if (!PrefsStore.isLoggedIn(this)) return
        SessionDiag.log(this, "session déclarée expirée (bandeau affiché)")
        PrefsStore.setSessionExpired(this, true)
        showSessionBanner(true)   // sans effet tant que l'écran de mise à jour est affiché
        (supportFragmentManager.findFragmentById(R.id.fragmentContainer) as? AgendaFragment)?.notifySessionExpired(true)
    }

    fun clearSessionExpired() {
        if (!PrefsStore.sessionExpired(this)) return
        PrefsStore.setSessionExpired(this, false)
        showSessionBanner(false)
        (supportFragmentManager.findFragmentById(R.id.fragmentContainer) as? AgendaFragment)?.notifySessionExpired(false)
    }

    /** Vérifie la session au retour dans l'app (au plus toutes les 5 minutes). */
    private fun checkSessionIfNeeded() {
        if (isAppBlockedForUpdate || !PrefsStore.isLoggedIn(this) || PrefsStore.qaDemo(this)) return
        val now = System.currentTimeMillis()
        if (now - lastSessionCheck < 5 * 60 * 1000) return
        lastSessionCheck = now
        UcaSync.checkSession(applicationContext) { expired ->
            SessionDiag.log(applicationContext, "contrôle de session à la reprise : " + when (expired) { true -> "formulaire de connexion affiché"; false -> "session valable"; null -> "indéterminé (réseau lent ou coupé)" })
            if (expired == false && !isFinishing && !isDestroyed) clearSessionExpired()
            if (expired != true || isFinishing || isDestroyed) return@checkSession
            // Un seul contrôle négatif ne suffit pas : on revérifie avant de verrouiller l'app.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                UcaSync.checkSession(applicationContext) { again ->
                    SessionDiag.log(applicationContext, "second contrôle : " + when (again) { true -> "formulaire de connexion affiché"; false -> "session valable"; null -> "indéterminé" })
                    if (again == true && !isFinishing && !isDestroyed) requireLogin()
                }
            }, 3000)
        }
    }

    /** Appelé par GateFragment juste après un login CAS réussi. */
    fun onLoggedIn() {
        enterApp()
    }

    /** Appelé depuis PreferencesFragment : efface la session, revient à l'écran de connexion unique. */
    fun logout() {
        PrefsStore.setLoggedIn(this, false)
        PrefsStore.setSessionExpired(this, false)
        showSessionBanner(false)
        PrefsStore.clearStudentProfile(this)
        ProfilePhoto.delete(this)
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
