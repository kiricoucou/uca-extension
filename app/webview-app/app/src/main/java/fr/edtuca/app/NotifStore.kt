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

/** Notifications de l'app (nouveau mail, nouvelle note…) : gardées sur le téléphone, 50 au maximum. */
object NotifStore {
    private const val MAX = 50
    private const val KEY = "notifs"
    private const val CHANNEL = "uca_news"

    data class Item(val type: String, val title: String, val text: String, val at: Long, val read: Boolean)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("uca_prefs", Context.MODE_PRIVATE)

    fun list(ctx: Context): List<Item> {
        val arr = try { JSONArray(prefs(ctx).getString(KEY, "[]")) } catch (_: Exception) { JSONArray() }
        return (0 until arr.length()).mapNotNull { i ->
            arr.optJSONObject(i)?.let { Item(it.optString("type"), it.optString("title"), it.optString("text"), it.optLong("at"), it.optBoolean("read")) }
        }
    }

    fun unread(ctx: Context): Int = list(ctx).count { !it.read }

    fun markAllRead(ctx: Context) {
        val arr = JSONArray()
        list(ctx).forEach { arr.put(toJson(it.copy(read = true))) }
        prefs(ctx).edit().putString(KEY, arr.toString()).apply()
    }

    fun clear(ctx: Context) { prefs(ctx).edit().remove(KEY).apply() }

    private fun toJson(i: Item) = JSONObject().put("type", i.type).put("title", i.title).put("text", i.text).put("at", i.at).put("read", i.read)

    /** Ajoute une notification à la liste et l'affiche dans la barre d'état. */
    fun post(ctx: Context, type: String, title: String, text: String) {
        val items = (listOf(Item(type, title, text, System.currentTimeMillis(), false)) + list(ctx)).take(MAX)
        val arr = JSONArray(); items.forEach { arr.put(toJson(it)) }
        prefs(ctx).edit().putString(KEY, arr.toString()).apply()
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
