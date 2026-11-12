package fr.edtuca.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Notifications de l'app (nouveau mail, nouvelle note…) : gardées sur le téléphone.
 * Gestion par l'utilisateur : lue / non lue, « gardée » (jamais supprimée automatiquement), supprimer, tout supprimer
 * sauf les gardées, durée de conservation réglable (Préférences). 50 non gardées au maximum.
 */
object NotifStore {
    private const val MAX = 50
    private const val KEY = "notifs"
    private const val CHANNEL = "uca_news"
    private const val DAY_MS = 86_400_000L

    data class Item(val type: String, val title: String, val text: String, val at: Long, val read: Boolean, val kept: Boolean = false)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("uca_prefs", Context.MODE_PRIVATE)

    private fun readAll(ctx: Context): List<Item> {
        val arr = try { JSONArray(prefs(ctx).getString(KEY, "[]")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let { Item(it.optString("type"), it.optString("title"), it.optString("text"), it.optLong("at"), it.optBoolean("read"), it.optBoolean("kept")) }
        }
    }

    private fun save(ctx: Context, items: List<Item>) {
        val arr = JSONArray(); items.forEach { arr.put(toJson(it)) }
        prefs(ctx).edit().putString(KEY, arr.toString()).apply()
    }

    /** Retire les notifications non gardées plus vieilles que la durée choisie (0 = illimité). Les gardées restent toujours. */
    fun prune(items: List<Item>, keepDays: Int, now: Long = System.currentTimeMillis()): List<Item> =
        if (keepDays <= 0) items else items.filter { it.kept || it.at >= now - keepDays * DAY_MS }

    fun list(ctx: Context): List<Item> {
        val all = readAll(ctx)
        val pruned = prune(all, PrefsStore.notifKeepDays(ctx))
        if (pruned.size != all.size) save(ctx, pruned)
        return pruned
    }

    fun unread(ctx: Context): Int = list(ctx).count { !it.read }

    fun markAllRead(ctx: Context) = save(ctx, list(ctx).map { it.copy(read = true) })

    private fun update(ctx: Context, at: Long, title: String, f: (Item) -> Item?) =
        save(ctx, list(ctx).mapNotNull { if (it.at == at && it.title == title) f(it) else it })

    fun toggleRead(ctx: Context, it0: Item) = update(ctx, it0.at, it0.title) { it.copy(read = !it.read) }
    fun toggleKeep(ctx: Context, it0: Item) = update(ctx, it0.at, it0.title) { it.copy(kept = !it.kept) }
    fun delete(ctx: Context, it0: Item) = update(ctx, it0.at, it0.title) { null }

    /** Supprime tout sauf les notifications gardées. */
    fun clearExceptKept(ctx: Context) = save(ctx, list(ctx).filter { it.kept })

    fun clear(ctx: Context) { prefs(ctx).edit().remove(KEY).apply() }

    private fun toJson(i: Item) = JSONObject().put("type", i.type).put("title", i.title).put("text", i.text).put("at", i.at).put("read", i.read).put("kept", i.kept)

    /** Ajoute une notification à la liste et l'affiche dans la barre d'état. */
    fun post(ctx: Context, type: String, title: String, text: String) {
        val all = listOf(Item(type, title, text, System.currentTimeMillis(), false)) + list(ctx)
        // Les gardées ne comptent pas dans la limite : seules les autres sont plafonnées.
        save(ctx, all.filter { it.kept } .plus(all.filter { !it.kept }.take(MAX)).sortedByDescending { it.at })
        try {
            val mgr = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mgr.createNotificationChannel(NotificationChannel(CHANNEL, "Actualités UCA", NotificationManager.IMPORTANCE_DEFAULT)
                    .apply { description = "Nouveaux mails, nouvelles notes" })
            }
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_email).setContentTitle(title).setContentText(text)
                .setAutoCancel(true).setContentIntent(open).build()
            mgr.notify((type + title).hashCode(), n)
        } catch (_: SecurityException) { /* notifications refusées : la liste de l'app reste à jour */ }
    }
}
