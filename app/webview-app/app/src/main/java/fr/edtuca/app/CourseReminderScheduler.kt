package fr.edtuca.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Notifications locales "prochains cours" : programme une alarme (AlarmManager,
 * pas besoin de permission "exact alarm" puisqu'on utilise set() non-exact,
 * suffisant pour un rappel de cours) LEAD_TIME_MINUTES avant chaque cours des
 * prochaines 48h. Appelé depuis AgendaFragment.onEventsUpdated si l'utilisateur
 * a activé "Prochains cours" dans Préférences.
 *
 * Limite connue : si le téléphone redémarre, les alarmes programmées sont
 * perdues (pas de RECEIVE_BOOT_COMPLETED ici) — elles seront reprogrammées à la
 * prochaine ouverture/sync de l'app. Les 3 autres catégories de notifications
 * (cours en ligne, bibliothèques, restaurants) restent des réglages sans effet
 * tant qu'on n'a pas de source de données Odin pour elles (voir PLAN.md §7.B).
 */
object CourseReminderScheduler {
    const val LEAD_TIME_MINUTES = 15
    private const val WINDOW_MS = 48L * 60 * 60 * 1000
    private const val MAX_ALARMS = 50

    fun schedule(context: Context, events: List<UcaEvent>) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        // Un cours supprimé/déplacé ne doit plus déclencher son ancien rappel.
        cancelAll(context)
        val scheduled = mutableSetOf<String>()
        val now = System.currentTimeMillis()
        // Android plafonne à 500 alarmes par app (IllegalStateException au-delà).
        val upcoming = events.filter { it.startMillis() in now..(now + WINDOW_MS) }.take(MAX_ALARMS)
        for (ev in upcoming) {
            val triggerAt = ev.startMillis() - LEAD_TIME_MINUTES * 60_000L
            if (triggerAt <= now) continue
            val requestCode = ("${ev.year}${ev.month}${ev.day}${ev.startH}${ev.startM}${ev.title}").hashCode()
            val intent = Intent(context, ReminderReceiver::class.java).apply {
                putExtra("title", ev.title)
                putExtra("room", ev.room ?: "")
                putExtra("startH", ev.startH)
                putExtra("startM", ev.startM)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, flags)
            try {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                scheduled.add(requestCode.toString())
            } catch (e: Exception) {
                // Permission notifications/alarme refusée entre-temps : on abandonne silencieusement.
            }
        }
        prefs(context).edit().putStringSet(KEY_CODES, scheduled).apply()
    }

    /** Annule tous les rappels programmés (logout, ou avant reprogrammation). */
    fun cancelAll(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val codes = prefs(context).getStringSet(KEY_CODES, emptySet()) ?: emptySet()
        for (code in codes) {
            val rc = code.toIntOrNull() ?: continue
            val pi = PendingIntent.getBroadcast(
                context, rc, Intent(context, ReminderReceiver::class.java),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            ) ?: continue
            alarmManager.cancel(pi)
            pi.cancel()
        }
        prefs(context).edit().remove(KEY_CODES).apply()
    }

    private const val KEY_CODES = "reminder_request_codes"
    private fun prefs(context: Context) = context.getSharedPreferences("uca_reminders", Context.MODE_PRIVATE)
}
