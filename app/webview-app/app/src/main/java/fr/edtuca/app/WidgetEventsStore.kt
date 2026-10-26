package fr.edtuca.app

import android.content.Context

/**
 * Cache minimal pour le widget home-screen : AppWidgetProvider tourne dans un
 * process qui peut être réveillé sans que la WebView/AgendaFragment le soit,
 * donc on ne peut pas relire le DOM JS — on garde juste le dernier JSON de
 * cours reçu par onEventsUpdated (même format que PhoneCalendarSync/
 * CourseReminderScheduler).
 */
object WidgetEventsStore {
    private const val FILE = "uca_widget"
    private const val KEY_JSON = "events_json"
    private const val MAX_JSON_LEN = 200_000

    fun save(context: Context, json: String) {
        if (json.length > MAX_JSON_LEN) return
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().putString(KEY_JSON, json).apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().remove(KEY_JSON).apply()
    }

    /** Cours en cours ou à venir le plus proche, ou null si rien en cache / rien à venir. */
    fun nextEvent(context: Context): UcaEvent? {
        val json = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_JSON, null)
            ?: return null
        val events = try { UcaEvent.parseList(json) } catch (e: Exception) { return null }
        val now = System.currentTimeMillis()
        return events.filter { it.endMillis() > now }.minByOrNull { it.startMillis() }
    }
}
