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
        val text = if (room.isNotBlank()) "$startLabel · $room" else startLabel

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
