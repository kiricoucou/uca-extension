package fr.edtuca.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/** Affiche la notification "prochain cours" programmée par CourseReminderScheduler. */
class ReminderReceiver : BroadcastReceiver() {
    companion object {
        const val CHANNEL_ID = "uca_course_reminders"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "Cours"
        val room = intent.getStringExtra("room") ?: ""
        val startH = intent.getIntExtra("startH", 0)
        val startM = intent.getIntExtra("startM", 0)

        // Le rappel ne vaut que juste avant le cours : si l'alarme arrive très en retard (ou l'heure a changé), on se tait.
        val startAt = intent.getLongExtra("startAt", 0L)
        val minutes = if (startAt > 0) ((startAt - System.currentTimeMillis() + 30_000L) / 60_000L).toInt() else CourseReminderScheduler.LEAD_TIME_MINUTES
        if (startAt > 0 && (minutes < 0 || minutes > CourseReminderScheduler.LEAD_TIME_MINUTES + 5)) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Prochains cours", NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "Rappel avant chaque cours de ton emploi du temps UCA" }
            manager.createNotificationChannel(channel)
        }

        val openAppIntent = Intent(context, MainActivity::class.java)
        val contentFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val contentPendingIntent = PendingIntent.getActivity(context, 0, openAppIntent, contentFlags)

        val startLabel = "%02d:%02d".format(startH, startM)
        val dans = if (minutes <= 0) "maintenant" else "dans $minutes min"
        val text = if (room.isNotBlank()) "$dans · $startLabel · $room" else "$dans · $startLabel"

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(contentPendingIntent)
            .build()

        manager.notify(("$title$startH$startM").hashCode(), notification)
    }
}
