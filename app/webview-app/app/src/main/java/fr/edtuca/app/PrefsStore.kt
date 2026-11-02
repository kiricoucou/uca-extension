package fr.edtuca.app

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * Préférences persistées : état de connexion global (un seul login CAS pour
 * toute l'app, pas un login par fonctionnalité) + mode d'affichage (sombre/
 * clair/système) + réglages de notifications par catégorie.
 */
object PrefsStore {
    private const val FILE = "uca_prefs"
    private const val KEY_LOGGED_IN = "logged_in"
    private const val KEY_THEME = "theme_mode" // "dark" | "light" | "system"
    private const val KEY_NOTIF_COURS = "notif_cours"
    private const val KEY_NOTIF_COURS_LIGNE = "notif_cours_ligne"
    private const val KEY_NOTIF_BIBLIO = "notif_biblio"
    private const val KEY_NOTIF_RESTO = "notif_resto"
    private const val KEY_SYNC_AUTO = "sync_auto"
    private const val KEY_SYNC_TEL = "sync_tel"

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun isLoggedIn(context: Context): Boolean =
        prefs(context).getBoolean(KEY_LOGGED_IN, false)

    fun setLoggedIn(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_LOGGED_IN, value).apply()
    }

    fun themeMode(context: Context): String =
        prefs(context).getString(KEY_THEME, "dark") ?: "dark"

    fun setThemeMode(context: Context, mode: String) {
        prefs(context).edit().putString(KEY_THEME, mode).apply()
        applyThemeMode(mode)
    }

    /** À appeler avant toute Activity (Application.onCreate) pour que le thème soit déjà posé au premier rendu. */
    fun applyThemeMode(mode: String) {
        AppCompatDelegate.setDefaultNightMode(
            when (mode) {
                "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                "light" -> AppCompatDelegate.MODE_NIGHT_NO
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
        )
    }

    fun notifCours(context: Context) = prefs(context).getBoolean(KEY_NOTIF_COURS, true)
    fun notifCoursLigne(context: Context) = prefs(context).getBoolean(KEY_NOTIF_COURS_LIGNE, true)
    fun notifBiblio(context: Context) = prefs(context).getBoolean(KEY_NOTIF_BIBLIO, false)
    fun notifResto(context: Context) = prefs(context).getBoolean(KEY_NOTIF_RESTO, false)
    fun syncAuto(context: Context) = prefs(context).getBoolean(KEY_SYNC_AUTO, true)
    fun syncTel(context: Context) = prefs(context).getBoolean(KEY_SYNC_TEL, false)

    fun setBool(context: Context, key: String, value: Boolean) {
        prefs(context).edit().putBoolean(key, value).apply()
    }

    const val K_NOTIF_COURS = KEY_NOTIF_COURS
    const val K_NOTIF_COURS_LIGNE = KEY_NOTIF_COURS_LIGNE
    const val K_NOTIF_BIBLIO = KEY_NOTIF_BIBLIO
    const val K_NOTIF_RESTO = KEY_NOTIF_RESTO
    const val K_SYNC_AUTO = KEY_SYNC_AUTO
    const val K_SYNC_TEL = KEY_SYNC_TEL

    const val KEY_INSTALLED_COMMIT = "installed_commit"
    const val KEY_INSTALLED_BUNDLE_VER = "installed_bundle_ver"

    fun installedCommit(context: Context): String =
        prefs(context).getString(KEY_INSTALLED_COMMIT, "dcf1390") ?: "dcf1390"

    fun setInstalledCommit(context: Context, sha: String) {
        prefs(context).edit().putString(KEY_INSTALLED_COMMIT, sha).apply()
    }

    fun installedBundleVersion(context: Context): String =
        prefs(context).getString(KEY_INSTALLED_BUNDLE_VER, "1.1.0") ?: "1.1.0"

    fun setInstalledBundleVersion(context: Context, ver: String) {
        prefs(context).edit().putString(KEY_INSTALLED_BUNDLE_VER, ver).apply()
    }

    private const val KEY_STUDENT_NAME = "student_name"
    private const val KEY_STUDENT_ID = "student_id"
    private const val KEY_STUDENT_EMAIL = "student_email"
    private const val KEY_STUDENT_FORMATION = "student_formation"
    private const val KEY_STUDENT_BIRTH = "student_birth"
    private const val KEY_STUDENT_GROUP = "student_group"

    fun studentName(context: Context): String =
        prefs(context).getString(KEY_STUDENT_NAME, "") ?: ""

    fun studentId(context: Context): String =
        prefs(context).getString(KEY_STUDENT_ID, "") ?: ""

    fun studentEmail(context: Context): String =
        prefs(context).getString(KEY_STUDENT_EMAIL, "") ?: ""

    fun studentFormation(context: Context): String =
        prefs(context).getString(KEY_STUDENT_FORMATION, "") ?: ""

    fun studentBirth(context: Context): String =
        prefs(context).getString(KEY_STUDENT_BIRTH, "") ?: ""

    fun studentGroup(context: Context): String =
        prefs(context).getString(KEY_STUDENT_GROUP, "") ?: ""

    fun setStudentProfile(
        context: Context,
        name: String? = null,
        id: String? = null,
        email: String? = null,
        formation: String? = null,
        birth: String? = null,
        group: String? = null
    ) {
        val editor = prefs(context).edit()
        name?.let { editor.putString(KEY_STUDENT_NAME, it) }
        id?.let { editor.putString(KEY_STUDENT_ID, it) }
        email?.let { editor.putString(KEY_STUDENT_EMAIL, it) }
        formation?.let { editor.putString(KEY_STUDENT_FORMATION, it) }
        birth?.let { editor.putString(KEY_STUDENT_BIRTH, it) }
        group?.let { editor.putString(KEY_STUDENT_GROUP, it) }
        editor.apply()
    }

    /** Une seule fois : efface les profils enregistrés par d'anciennes versions (qui pouvaient contenir un enseignant). */
    fun migrateProfileOnce(context: Context) {
        val p = prefs(context)
        if (p.getInt("profile_schema", 0) >= 2) return
        clearStudentProfile(context)
        p.edit().putInt("profile_schema", 2).apply()
    }

    val DESIGNS = listOf("anime" to "Animé (sombre turquoise)", "professionnel" to "Professionnel", "bulletin" to "Bulletin", "carnet" to "Carnet")

    /** Design choisi (agenda de l'app), ou null s'il n'a jamais été choisi. */
    fun design(context: Context): String? =
        prefs(context).getString("design", null)?.takeIf { id -> DESIGNS.any { it.first == id } }

    fun setDesign(context: Context, id: String) {
        if (DESIGNS.none { it.first == id }) return
        prefs(context).edit().putString("design", id).apply()
    }

    fun clearStudentProfile(context: Context) {
        prefs(context).edit()
            .remove(KEY_STUDENT_NAME).remove(KEY_STUDENT_ID).remove(KEY_STUDENT_EMAIL)
            .remove(KEY_STUDENT_FORMATION).remove(KEY_STUDENT_BIRTH).remove(KEY_STUDENT_GROUP)
            .apply()
    }
}
