package fr.edtuca.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

/**
 * Widget « Prochain cours » (le premier widget de l'app). Il utilise maintenant le même dessin que les 24 autres
 * (WidgetRenderer) ; tant que la page n'a pas envoyé son résumé, il vit des cours en cache (WidgetEventsStore).
 * Aucun accès réseau ni WebView depuis ce process : un widget doit rester instantané.
 */
class AgendaWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, WidgetRenderer.render(context, "next"))
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        appWidgetManager.updateAppWidget(appWidgetId, WidgetRenderer.render(context, "next"))
    }

    companion object {
        /** Appelé après chaque cache de cours mis à jour (ou vidé au logout) : rafraîchit TOUS les widgets posés. */
        fun requestUpdate(context: Context) {
            try { WidgetRenderer.updateAll(context.applicationContext) } catch (e: Exception) { /* un widget en retard n'est pas grave */ }
        }
    }
}
