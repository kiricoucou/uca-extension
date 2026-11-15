package fr.edtuca.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

/** Un widget de l'écran d'accueil : même liste et mêmes noms que core/widgets.js (app web). */
data class WidgetDef(val id: String, val name: String, val provider: Class<*>)

object WidgetCatalog {
    val ALL: List<WidgetDef> = listOf(
        WidgetDef("next", "Prochain cours", AgendaWidgetProvider::class.java),
        WidgetDef("day", "Ma journée", WDayWidget::class.java),
        WidgetDef("days3", "3 jours", WDays3Widget::class.java),
        WidgetDef("week", "Charge de la semaine", WWeekWidget::class.java),
        WidgetDef("now", "Cours en cours", WNowWidget::class.java),
        WidgetDef("room", "Salle du prochain cours", WRoomWidget::class.java),
        WidgetDef("endday", "Fin de journée", WEnddayWidget::class.java),
        WidgetDef("break", "Prochaine pause", WBreakWidget::class.java),
        WidgetDef("freeday", "Prochain jour libre", WFreedayWidget::class.java),
        WidgetDef("date", "Aujourd'hui", WDateWidget::class.java),
        WidgetDef("tasks", "Devoirs à faire", WTasksWidget::class.java),
        WidgetDef("late", "Devoirs en retard", WLateWidget::class.java),
        WidgetDef("nexttask", "Prochain devoir", WNexttaskWidget::class.java),
        WidgetDef("exams", "Examens à venir", WExamsWidget::class.java),
        WidgetDef("countdown", "Compte à rebours examen", WCountdownWidget::class.java),
        WidgetDef("avg", "Moyenne générale", WAvgWidget::class.java),
        WidgetDef("trend", "Évolution de la moyenne", WTrendWidget::class.java),
        WidgetDef("notes", "Notes par matière", WNotesWidget::class.java),
        WidgetDef("recent", "Dernières notes", WRecentWidget::class.java),
        WidgetDef("best", "Meilleure matière", WBestWidget::class.java),
        WidgetDef("worst", "Matière à surveiller", WWorstWidget::class.java),
        WidgetDef("absences", "Absences", WAbsencesWidget::class.java),
        WidgetDef("status", "Connexion", WStatusWidget::class.java),
        WidgetDef("sync", "Dernière synchronisation", WSyncWidget::class.java),
        WidgetDef("shortcuts", "Raccourcis", WShortcutsWidget::class.java),
    )

    fun byId(id: String): WidgetDef? = ALL.firstOrNull { it.id == id }
}

/** Résumé reçu de la page web, gardé pour les widgets (ils tournent sans WebView). */
object WidgetDataStore {
    private const val FILE = "uca_widget"
    private const val KEY = "snapshot_json"
    private const val MAX_JSON_LEN = 150_000

    fun save(context: Context, json: String) {
        if (json.length > MAX_JSON_LEN) return
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().remove(KEY).apply()
    }

    /** Dernier résumé ; à défaut, les cours déjà en cache (ancien widget « Prochain cours »). */
    fun load(context: Context, now: Long): WSnapshot? {
        val json = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)
        val parsed = json?.let { WidgetModel.parse(it) }
        if (parsed != null) return parsed
        val events = WidgetEventsStore.allEvents(context)
        return if (events.isEmpty()) null else WidgetModel.fromEvents(events, now)
    }
}

/** Base commune : chaque widget dessine sa vue avec WidgetRenderer. */
abstract class UcaWidgetProvider(private val widgetId: String) : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, WidgetRenderer.render(context, widgetId))
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        appWidgetManager.updateAppWidget(appWidgetId, WidgetRenderer.render(context, widgetId))
    }
}

class WDayWidget : UcaWidgetProvider("day")
class WDays3Widget : UcaWidgetProvider("days3")
class WWeekWidget : UcaWidgetProvider("week")
class WNowWidget : UcaWidgetProvider("now")
class WRoomWidget : UcaWidgetProvider("room")
class WEnddayWidget : UcaWidgetProvider("endday")
class WBreakWidget : UcaWidgetProvider("break")
class WFreedayWidget : UcaWidgetProvider("freeday")
class WDateWidget : UcaWidgetProvider("date")
class WTasksWidget : UcaWidgetProvider("tasks")
class WLateWidget : UcaWidgetProvider("late")
class WNexttaskWidget : UcaWidgetProvider("nexttask")
class WExamsWidget : UcaWidgetProvider("exams")
class WCountdownWidget : UcaWidgetProvider("countdown")
class WAvgWidget : UcaWidgetProvider("avg")
class WTrendWidget : UcaWidgetProvider("trend")
class WNotesWidget : UcaWidgetProvider("notes")
class WRecentWidget : UcaWidgetProvider("recent")
class WBestWidget : UcaWidgetProvider("best")
class WWorstWidget : UcaWidgetProvider("worst")
class WAbsencesWidget : UcaWidgetProvider("absences")
class WStatusWidget : UcaWidgetProvider("status")
class WSyncWidget : UcaWidgetProvider("sync")
class WShortcutsWidget : UcaWidgetProvider("shortcuts")
