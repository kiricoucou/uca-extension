package fr.edtuca.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Widget home-screen "Prochain cours". Lit le cache posé par
 * AgendaFragment.onEventsUpdated (WidgetEventsStore) — aucun accès réseau ni
 * WebView depuis ce process, un widget doit rester instantané. Tap ouvre
 * l'app, qui atterrit directement sur l'Agenda (MainActivity.enterApp()).
 */
class AgendaWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateOne(context, appWidgetManager, id)
    }

    private fun updateOne(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_edt)

        val openApp = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widgetRoot, openApp)

        val ev = WidgetEventsStore.nextEvent(context)
        if (ev == null) {
            views.setTextViewText(R.id.widgetLabel, "Prochain cours")
            views.setTextViewText(R.id.widgetTitle, "Rien de prévu")
            views.setTextViewText(R.id.widgetSub, "")
        } else {
            val ongoing = ev.startMillis() <= System.currentTimeMillis()
            views.setTextViewText(R.id.widgetLabel, if (ongoing) "En cours" else "Prochain cours")
            views.setTextViewText(R.id.widgetTitle, ev.title)
            val horaire = "%02d:%02d-%02d:%02d".format(ev.startH, ev.startM, ev.endH, ev.endM)
            val sub = listOfNotNull(horaire, ev.room).joinToString("  ·  ")
            views.setTextViewText(R.id.widgetSub, sub)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    companion object {
        /** Appelé depuis AgendaFragment après chaque cache de cours mis à jour (ou vidé au logout). */
        fun requestUpdate(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, AgendaWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val intent = Intent(context, AgendaWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            }
            context.sendBroadcast(intent)
        }
    }
}
