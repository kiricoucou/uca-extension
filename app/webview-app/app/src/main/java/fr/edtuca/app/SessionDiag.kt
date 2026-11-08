package fr.edtuca.app

import android.content.Context
import android.webkit.CookieManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Diagnostic de la connexion, à copier pour un signalement de bug. Il ne montre JAMAIS la valeur d'un cookie :
 * seulement quels cookies existent (par nom) pour les sites de l'UCA, et le résultat des derniers contrôles de session.
 */
object SessionDiag {
    private const val KEY = "diag_session_log"
    private val fmt = SimpleDateFormat("d MMM HH:mm:ss", Locale.FRANCE)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("uca_prefs", Context.MODE_PRIVATE)

    /** Garde les 12 derniers événements (contrôle de session, connexion, verrouillage) : texte sans donnée personnelle. */
    fun log(ctx: Context, event: String) {
        val old = prefs(ctx).getString(KEY, "") ?: ""
        val lines = (listOf(fmt.format(Date()) + " · " + event) + old.split("\n").filter { it.isNotBlank() }).take(12)
        prefs(ctx).edit().putString(KEY, lines.joinToString("\n")).apply()
    }

    private fun cookieNames(url: String): String {
        val raw = CookieManager.getInstance().getCookie(url) ?: return "aucun"
        val names = raw.split(";").map { it.substringBefore("=").trim() }.filter { it.isNotEmpty() }
        return if (names.isEmpty()) "aucun" else names.joinToString(", ") + " (" + names.size + ")"
    }

    fun report(ctx: Context): String {
        val sb = StringBuilder()
        sb.append("Version de l'app : ").append(try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName } catch (_: Exception) { "?" }).append("\n")
        sb.append("État « connecté » de l'app : ").append(PrefsStore.isLoggedIn(ctx)).append("\n")
        sb.append("Session marquée expirée : ").append(PrefsStore.sessionExpired(ctx)).append("\n\n")
        sb.append("Cookies présents (noms seulement, jamais les valeurs) :\n")
        sb.append("• ent.uca.fr : ").append(cookieNames("https://ent.uca.fr/")).append("\n")
        sb.append("• odin.iut.uca.fr : ").append(cookieNames("https://odin.iut.uca.fr/")).append("\n")
        sb.append("• mail.uca.fr : ").append(cookieNames("https://mail.uca.fr/")).append("\n\n")
        sb.append("Derniers événements :\n")
        val log = prefs(ctx).getString(KEY, "") ?: ""
        sb.append(if (log.isBlank()) "aucun" else log)
        return sb.toString()
    }
}
