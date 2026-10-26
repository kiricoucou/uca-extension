package fr.edtuca.app

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.provider.CalendarContract
import java.util.TimeZone

/**
 * Sync calendrier téléphone réelle : écrit les cours dans un calendrier Android
 * dédié "Emploi du temps UCA" (créé automatiquement, aucun compte externe requis
 * — calendrier local), via CalendarContract. Appelé depuis AgendaFragment à
 * chaque mise à jour des cours (onEventsUpdated), si l'utilisateur a activé
 * "Ajouter l'emploi du temps au calendrier du téléphone" dans Préférences.
 *
 * Stratégie simple et sûre : on supprime tous les events qu'on avait créés dans
 * CE calendrier dédié, puis on les réécrit avec la liste à jour. Comme c'est un
 * calendrier qui n'appartient qu'à nous (pas le calendrier perso de
 * l'utilisateur), pas de risque d'effacer autre chose.
 */
object PhoneCalendarSync {
    private const val CALENDAR_NAME = "EdtUcaLocalCalendar"
    private const val CALENDAR_DISPLAY_NAME = "Emploi du temps UCA"
    private const val ACCOUNT_NAME = "Emploi du temps UCA"

    fun sync(context: Context, events: List<UcaEvent>) {
        try {
            val calId = findOrCreateCalendar(context) ?: return
            clearEvents(context, calId)
            val tz = TimeZone.getDefault().id
            for (ev in events) {
                val values = ContentValues().apply {
                    put(CalendarContract.Events.CALENDAR_ID, calId)
                    put(CalendarContract.Events.TITLE, ev.title)
                    put(CalendarContract.Events.EVENT_LOCATION, ev.room ?: "")
                    put(
                        CalendarContract.Events.DESCRIPTION,
                        if (!ev.teacher.isNullOrBlank()) "Enseignant : ${ev.teacher}" else ""
                    )
                    put(CalendarContract.Events.DTSTART, ev.startMillis())
                    put(CalendarContract.Events.DTEND, ev.endMillis())
                    put(CalendarContract.Events.EVENT_TIMEZONE, tz)
                }
                context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
            }
        } catch (e: SecurityException) {
            // Permission WRITE_CALENDAR refusée/retirée entre-temps : on abandonne
            // silencieusement, le switch dans Préférences restera coché mais sans
            // effet jusqu'à ce que la permission soit réaccordée.
        }
    }

    /** Supprime le calendrier dédié (et donc tous ses events) — utilisé au logout. */
    fun clear(context: Context) {
        try {
            context.contentResolver.delete(
                CalendarContract.Calendars.CONTENT_URI.buildUpon()
                    .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                    .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
                    .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
                    .build(),
                "${CalendarContract.Calendars.ACCOUNT_NAME} = ? AND ${CalendarContract.Calendars.NAME} = ?",
                arrayOf(ACCOUNT_NAME, CALENDAR_NAME)
            )
        } catch (e: SecurityException) { }
    }

    private fun findOrCreateCalendar(context: Context): Long? {
        val projection = arrayOf(CalendarContract.Calendars._ID)
        val selection = "${CalendarContract.Calendars.ACCOUNT_NAME} = ? AND ${CalendarContract.Calendars.NAME} = ?"
        val args = arrayOf(ACCOUNT_NAME, CALENDAR_NAME)
        context.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, selection, args, null)?.use { c ->
            if (c.moveToFirst()) return c.getLong(0)
        }

        val values = ContentValues().apply {
            put(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
            put(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(CalendarContract.Calendars.NAME, CALENDAR_NAME)
            put(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CALENDAR_DISPLAY_NAME)
            put(CalendarContract.Calendars.CALENDAR_COLOR, 0x18B7B0)
            put(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL, CalendarContract.Calendars.CAL_ACCESS_OWNER)
            put(CalendarContract.Calendars.OWNER_ACCOUNT, ACCOUNT_NAME)
            put(CalendarContract.Calendars.VISIBLE, 1)
            put(CalendarContract.Calendars.SYNC_EVENTS, 1)
        }
        val uri = context.contentResolver.insert(
            CalendarContract.Calendars.CONTENT_URI.buildUpon()
                .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
                .appendQueryParameter(CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
                .build(),
            values
        ) ?: return null
        return ContentUris.parseId(uri)
    }

    private fun clearEvents(context: Context, calId: Long) {
        context.contentResolver.delete(
            CalendarContract.Events.CONTENT_URI,
            "${CalendarContract.Events.CALENDAR_ID} = ?",
            arrayOf(calId.toString())
        )
    }
}
