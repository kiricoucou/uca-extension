package fr.edtuca.app

import org.json.JSONArray
import java.util.Calendar

/**
 * Un cours, tel que renvoyé par window.__ucaOnEvents (index.html, render() ->
 * notifyNativeEvents() -> filteredCourses()). Même forme que les objets event
 * produits par parseScheduleText côté extension/site : year/month(0-index)/day,
 * startH/startM/endH/endM, title, teacher, room.
 */
data class UcaEvent(
    val year: Int,
    val month: Int,
    val day: Int,
    val startH: Int,
    val startM: Int,
    val endH: Int,
    val endM: Int,
    val title: String,
    val teacher: String?,
    val room: String?
) {
    fun startMillis(): Long = Calendar.getInstance().apply {
        set(year, month, day, startH, startM, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun endMillis(): Long = Calendar.getInstance().apply {
        set(year, month, day, endH, endM, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun isValid(): Boolean =
        year in 2000..2100 && month in 0..11 && day in 1..31 &&
            startH in 0..23 && endH in 0..23 && startM in 0..59 && endM in 0..59 &&
            title.isNotBlank()

    companion object {
        // Une année scolaire tient largement dedans ; au-delà ce sont des données forgées.
        private const val MAX_EVENTS = 2000
        private const val MAX_TEXT = 200

        fun parseList(json: String): List<UcaEvent> {
            val out = mutableListOf<UcaEvent>()
            val arr = JSONArray(json)
            for (i in 0 until minOf(arr.length(), MAX_EVENTS)) {
                val o = arr.optJSONObject(i) ?: continue
                val ev = UcaEvent(
                    year = o.optInt("year"),
                    month = o.optInt("month"),
                    day = o.optInt("day"),
                    startH = o.optInt("startH"),
                    startM = o.optInt("startM"),
                    endH = o.optInt("endH"),
                    endM = o.optInt("endM"),
                    title = o.optString("title", "").take(MAX_TEXT),
                    teacher = o.optString("teacher", "").take(MAX_TEXT).ifBlank { null },
                    room = o.optString("room", "").take(MAX_TEXT).ifBlank { null }
                )
                if (ev.isValid()) out.add(ev)
            }
            return out
        }
    }
}
